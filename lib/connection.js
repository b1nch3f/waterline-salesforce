'use strict';

var Promise = require('bluebird');
var assert = require('assert');
var jsforce = require('jsforce');
var moment = require('moment');
var assign = require('object-assign');
var Errors = require('waterline-errors').adapter;

module.exports = Connection;

function Connection(connectionObject) {
  assert(connectionObject, Errors.InvalidConnection);
  var self = this;

  assign(this, {
    expiresOn: moment(),
    config: {},
    connection: null,
    collections: {}
  }, connectionObject);

  this.initPicklistValidation();

  this.metaCache = {};
}

Connection.prototype.getConnection = function getConnection() {

  if ((this.connectionPromise && moment().isBefore(this.expiresOn)) || this.makingConnection) {
    return this.connectionPromise;
  }

  var config = this.config;
  if (!this.connection) {
    var connection = new jsforce.Connection(config.connectionParams);
    this.connection = connection;
  }

  this.makingConnection = true;

  this.connectionPromise = Promise.resolve(this.connection.login(config.username, config.password))
    .then(function (user) {
      this.makingConnection = false;
      this.expiresOn = moment().add(
        config.maxConnectionAge.val,
        config.maxConnectionAge.unit
      );
      return this.connection;
    }.bind(this));

  return this.connectionPromise;
};

Connection.prototype.initPicklistValidation = function () {
  var self = this;
  var picklistKey = this.config.picklistKey;
  var collections = this.collections;

  Object.keys(collections).forEach(function (collectionName) {
    var collection = collections[collectionName];
    Object.keys(collection._attributes).forEach(function (key) {
      var attribute = collection._attributes[key];
      if (attribute[picklistKey]) {
        var columnName = attribute.columnName || key;
        delete collection._validator.validations[key][picklistKey];
        collection._validator.validations[key].in = function (cb) {
          self.tableMeta(collectionName).then(function (meta) {
            var picklist = meta.picklists[columnName];
            return picklist ? picklist.map(function (k) { return k.value }) : [this[key]];
          })
            .catch(function () { return []; }).then(cb);
        };
      }
      delete attribute[picklistKey];
    });
  });
};

Connection.prototype.tableMeta = function (tableName) {
  if (this.metaCache[tableName]) { return this.metaCache[tableName]; }
  return this.metaCache[tableName] = this.getConnection()
    .then(function (connection) {
      return Promise.fromNode(function (cb) {
        connection.sobject(tableName).describe(cb);
      }).catch(function (err) {
        if (err.errorCode !== 'NOT_FOUND') { throw err; }
        return {
          childRelationships: [],
          fields: [],
        };
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
            return {
              value: value.value,
              validFor: value.validFor,
              label: value.label,
            };
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
