'use strict'

var EventEmitter = require('events').EventEmitter
var core = require('../../node-xmpp-core')
var Element = core.Element
var StreamParser = core.StreamParser
var Connection = core.Connection
var inherits = core.inherits
    // var ws = require('ws')
var logger = require('../../RtcLogger.js');

// we ignore ws in the browser field of package.json
// var WebSocket = ws.Server ? ws : window.WebSocket
var WebSocket = window.WebSocket;

var NS_FRAMING = 'urn:ietf:params:xml:ns:xmpp-framing'
var NS_XMPP_TLS = 'urn:ietf:params:xml:ns:xmpp-tls'
var NS_STREAM = 'http://etherx.jabber.org/streams'
var NS_XMPP_STREAMS = 'urn:ietf:params:xml:ns:xmpp-streams'

var INITIAL_RECONNECT_DELAY = 1e3
var MAX_RECONNECT_DELAY = 30e3

var STREAM_OPEN = 'stream:stream'
var STREAM_CLOSE = '</stream:stream>'

function WSConnection(opts) {
    EventEmitter.call(this)

    this.url = opts.websocket.url
    this.jid = opts.jid
    this.xmlns = {
            '': NS_XMPP_STREAMS,
            'stream': NS_STREAM
        }
        //this.xmlns = NS_XMPP_STREAMS
        //this.xmlns.stream = NS_STREAM

    this.websocket = new WebSocket(this.url, ['xmpp'])
    this.websocket.onopen = this.onopen.bind(this)
    this.websocket.onmessage = this.onmessage.bind(this)
    this.websocket.onclose = this.onclose.bind(this)
    this.websocket.onerror = this.onerror.bind(this)
}

inherits(WSConnection, EventEmitter)

WSConnection.prototype.maxStanzaSize = 65535
WSConnection.prototype.xmppVersion = '1.0'

WSConnection.prototype.onopen = function() {
    this.startParser()
    this.emit('connected')
}

WSConnection.prototype.startParser = function() {
    var self = this
    this.parser = new StreamParser.StreamParser(this.maxStanzaSize)

    this.parser.on('start', function(attrs) {
        self.streamAttrs = attrs
            /* We need those xmlns often, store them extra */
        self.streamNsAttrs = {}
        for (var k in attrs) {
            if ((k === 'xmlns') ||
                (k.substr(0, 6) === 'xmlns:')) {
                self.streamNsAttrs[k] = attrs[k]
            }
        }

        /* Notify in case we don't wait for <stream:features/>
           (Component or non-1.0 streams)
         */
        self.emit('streamStart', attrs)
    })
    this.parser.on('stanza', function(stanza) {
        // self.onStanza(self.addStreamNs(stanza))
        self.onStanza(stanza)
    })
    this.parser.on('error', this.onerror.bind(this))
    this.parser.on('end', function() {
        self.stopParser()
        self.end()
    })
}

WSConnection.prototype.stopParser = function() {
    /* No more events, please (may happen however) */
    if (this.parser) {
        /* Get GC'ed */
        delete this.parser
    }
}

WSConnection.prototype.onmessage = function(msg) {


    if ((msg.data.indexOf('c2p1') !== -1)) {
        logger.log(logger.level.VERBOSE, "WS", "RX <-- " + msg.data)
    } else {
        logger.log(logger.level.INFO, "WS", "RX <-- " + msg.data)
    }

    // logger.log(logger.level.INFO, "WS", "RX <-- " + msg.data)
    if (msg && msg.data && this.parser) {
        this.parser.write(msg.data)
    }
}

WSConnection.prototype.onStanza = function(stanza) {
    if (stanza.is('error', Connection.NS_STREAM)) {
        /* TODO: extract error text */
        this.emit('error', stanza)
    } else {
        this.emit('stanza', stanza)
    }
}

WSConnection.prototype.startStream = function() {
    /*var attrs = {}
    for (var k in this.xmlns) {
      if (this.xmlns.hasOwnProperty(k)) {
        if (!k) {
          attrs.xmlns = this.xmlns[k]
        } else {
          attrs['xmlns:' + k] = this.xmlns[k]
        }
      }
    }
    if (this.xmppVersion) attrs.version = this.xmppVersion
    if (this.streamTo) attrs.to = this.streamTo
    if (this.jid) attrs.to = this.jid.domain

    this.send(new Element('open', attrs))

    this.streamOpened = true*/
    var attrs = {}
    for (var k in this.xmlns) {
        if (this.xmlns.hasOwnProperty(k)) {
            if (!k) {
                attrs.xmlns = this.xmlns[k]
            } else {
                attrs['xmlns:' + k] = this.xmlns[k]
            }
        }
    }
    /*for (k in this.streamAttrs) {
      if (this.streamAttrs.hasOwnProperty(k)) {
        attrs[k] = this.streamAttrs[k]
      }
    }*/

    if (this.streamTo) { // in case of a component connecting
        attrs.to = this.streamTo
    }
    if (this.jid) attrs.to = this.jid.domain
    if (this.xmppVersion) attrs.version = this.xmppVersion
    attrs.xmlns = 'jabber:client';

    var el = new Element(STREAM_OPEN, attrs)
    var streamOpen
    if (el.name === 'stream:stream') {
        // make it non-empty to cut the closing tag
        el.t(' ')
        var s = el.toString()
        streamOpen = s.substr(0, s.indexOf(' </stream:stream>'))
    } else {
        streamOpen = el.toString()
    }

    this.streamOpened = true
    this.send(streamOpen)
}

WSConnection.prototype.send = function(stanza) {

    if (stanza.root) stanza = stanza.root()

    if (stanza.attrs && !stanza.attrs.xmlns && ((stanza.is('iq')) ||
            stanza.is('presence') || stanza.is('message') || stanza.is('stream'))) {
        stanza.attrs.xmlns = 'jabber:client'
    }

    if (stanza.attrs && (stanza.attrs.id == 'c2p1' /*|| stanza.attrs.id == "c2s1"*/ )) {
        stanza = stanza.toString()
        logger.log(logger.level.VERBOSE, "WS", "TX --> " + stanza)
    } else {
        stanza = stanza.toString();
        // stanza = stanza.replace(/&quot;/g, "\'");
        logger.log(logger.level.INFO, "WS", "TX --> " + stanza)
    }
    this.websocket.send(stanza);
}

WSConnection.prototype.onclose = function() {
    this.emit('disconnect')
    this.emit('close')
}

WSConnection.prototype.end = function() {
    this.send(new Element('close', { xmlns: NS_FRAMING }))
    this.emit('disconnect')
    this.emit('end')
    if (this.websocket) this.websocket.close()
}

WSConnection.prototype.onerror = function(e) {
    this.emit('error', e)
}

module.exports = WSConnection
