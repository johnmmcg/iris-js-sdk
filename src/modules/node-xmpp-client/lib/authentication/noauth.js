'use strict'

var Mechanism = require('./mechanism')
var inherits = require('../../../node-xmpp-core').inherits

/**
 * @see http://tools.ietf.org/html/rfc4505
 * @see http://xmpp.org/extensions/xep-0175.html
 */
function Noauth () {}

inherits(Noauth, Mechanism)

Noauth.prototype.name = 'NOAUTH'

Noauth.prototype.auth = function () {
  return this.authzid
}

Noauth.prototype.match = function () {
  return true
}

module.exports = Noauth
