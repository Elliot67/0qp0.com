#!/usr/bin/env node
'use strict'

var fs = require('fs')
var path = require('path')
// var _ = require('lodash');
var State = require('./State.js')
var express = require('express')
var app = express()
var http = require('http')
var server = http.createServer(app)
var io = require('socket.io').listen(server)
var state = new State(path.join(__dirname, '/state.json'))
var config = null

function updateConfig() {
  try {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, '/config.json')))
    config.bannedIPs = [].concat(config.bannedIPs)
    config.modIPs = [].concat(config.modIPs)
    console.log('Loaded config:\n', config)
    return true
  } catch (e) {
    console.log('Config loading failed\n', e)
    if (!config) process.exit()
  }
}

updateConfig()

var board = state.read('board')

var stats = {
  boardRequestCount: 0,
  flipRequestCount: 0,
  start: Date.now(),
  startDate: new Date(Date.now())
}

app.use(express.static(path.join(__dirname, '/../public/'), { index: 'index.htm' }))

// ////////////////

io.sockets.on('connection', function(socket) {
  socket.on(config.updateConfigPath, function() {
    socket.emit('updateConfig', updateConfig())
  })

  socket.on('board', function() {
    stats.boardRequestCount++
    socket.emit('board', board)
  })

  socket.on('save', function() {
    state.write('board', board)
    socket.emit('save', 'Board saved!')
  })

  socket.on('flip', function(cell) {
    var ip = socket.handshake.address.address
    if (~config.bannedIPs.indexOf(ip)) {
      console.log('banned ip:', ip)
      socket.emit('banned', cell)
      return
    }

    stats.flipRequestCount++
    var index = board.indexOf(cell)
    if (~index) {
      board.splice(index, 1)
    } else {
      board.push(cell)
    }
    if (stats.flipRequestCount % 100 === 0) state.write('board', board)
    io.sockets.emit('flip', { cell: cell, state: !~index })
  })

  socket.on('stats', function() {
    stats.now = Date.now()
    stats.nowDate = new Date(stats.now)
    stats.hoursRunning = ((stats.now - stats.start) / 1000 / 60 / 60).toFixed(3)
    stats.flipsPerHour = stats.flipRequestCount / stats.hoursRunning
    socket.emit('stats', stats) // TODO: add to client
  })

  // socket.on('disconnect', function() { });
})

server.listen(config.port)
console.log('now listening to port', config.port)
