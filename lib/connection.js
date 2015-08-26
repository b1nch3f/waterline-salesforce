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

  this.metaCache = {};
}

Connection.prototype.getConnection = function getConnection() {

  if (this.connection && moment().isBefore(this.expiresOn)) {
    return Promise.resolve(this.connection);
  }

  var config = this.config;
  var connection = new jsforce.Connection(config.connectionParams);
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

Connection.prototype.tableMeta = function (tableName) {
  if (this.metaCache[tableName]) { return this.metaCache[tableName]; }
  return this.metaCache[tableName] = this.getConnection()
    .then(function (connection) {
      return Promise.fromNode(function (cb) {
        connection.sobject(tableName).describe(cb);
      });
    })
    .then(function (tableMeta) {
      tableMeta.children = tableMeta.childRelationships.reduce(function (rels, relationship) {
        rels[relationship.childSObject] = relationship.relationshipName;
        return rels;
      }, {});
      tableMeta.picklists = tableMeta.fields
        .filter(function (field) {
          return field.type === 'picklist';
        })
        .reduce(function (fields, field) {
          fields[field.name] = field.picklistValues.map(function (value) {
            return value.value;
          });
          return fields;
        }, {});
      return tableMeta;
    });
};

Connection.prototype.joins = function (joins) {
  var tables = {};
  var promises = (joins || []).map(function (join) {
    return this.tableMeta(join.parent)
      .then(function (metaData) {
        tables[join.parent] = metaData;
        // TODO handle subjoins
      }.bind(this));
  }, this);
  return Promise.all(promises).then(function () { return tables; });
};
