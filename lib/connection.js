'use strict';

var Promise = require('bluebird');
var assert  = require('assert');
var jsforce = require('jsforce');
var moment  = require('moment');
var assign  = require('object-assign');
var Errors  = require('waterline-errors').adapter;

module.exports = Connection;

function Connection(connectionObject) {
  assert(connectionObject, Errors.InvalidConnection);

  assign(this, {
    expiresOn: moment(),
    config: {},
    connection: null,
    collections: []
  }, connectionObject);

  this.pluralTable = {};
}

Connection.prototype.getConnection = function getConnection() {

  if (this.connection && moment().isBefore(this.expiresOn)) {
    return Promise.resolve(this.connection);
  }

  var config = this.config;
  var connection = new jsforce.Connection(config.connectionsParams);
  connection.login = Promise.promisify(connection.login, connection);

  this.connection = connection;

  return connection
    .login(config.username, config.password)
    .then(function (user) {
      this.expiresOn = moment().add(
        config.maxConnectionAge.val,
        config.maxConnectionAge.unit
      );
      return this.connection;
    }.bind(this));


};

Connection.prototype.pluralizedTable = function pluralizedTabled(tableName) {
  if (this.pluralTable[tableName]) { return this.pluralTable[tableName]; }
  return this.getConnection()
    .then(function (connection) {
      return Promise.fromNode(function (cb) {
        connection.sobject(tableName).describe(cb);
      });
    })
    .then(function (tableMeta) {
      this.pluralTable[tableName] = tableMeta.labelPlural;
      return tableMeta.labelPlural;
    }.bind(this));
};

Connection.prototype.getPluralHash = function getPluralHash(joins) {
  var tables = {};
  var promises = [];
  (joins || []).forEach(function (join) {
    tables[join.child] = {};
    promises.push(
      this.pluralizedTable(join.child)
        .then(function (plural) {
          tables[join.child].plural = plural;
          if (!join.criteria.joins) { return; }
          return getPluralHash(join.criteria.joins);
        })
        .then(function (subJoins) {
          if (!subJoins) { return; }
          tables[join.child].sub = subJoins;
        })
    );
  }.bind(this), {});
  return Promise.all(promises).then(function () { return tables; });
};
