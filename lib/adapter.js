/**
 * Module Dependencies
 */
var Promise    = require('bluebird');
var _          = require('lodash');
var jsforce    = require('jsforce');
var moment     = require('moment');
var captains   = require('captains-log');
var Errors     = require('waterline-errors').adapter;
var Connection = require('./connection');
var assign     = require('object-assign');
var buildQuery = require('./query').buildQuery;
var log        = captains();

// Keep track of all the connections used by the app
var connections = {};

module.exports = {
  // to track schema internally
  syncable: false,
  defaults: {
    maxConnectionAge: {unit: 'minutes', val: 30}
  },

  /**
   * regiserConnection
   */
  registerConnection: function (connection, collections, cb) {
    Promise
      .resolve()
      .then(function () {
        if (!connection.identity) {
          throw new Error(Errors.IdentityMissing);
        }
        if (connections[connection.identity]) {
          throw new Error(Errors.IdentityDuplicate);
        }

        connections[connection.identity] = new Connection({
          config: connection,
          collections: collections,
          connection: null,
          expiresOn: 0
        });

        return connections[connection.identity].getConnection();
      })
      .nodeify(cb);
  },

  /**
   * find
   */
  find: function (connectionName, collectionName, options, cb) {
    var collection = connections[connectionName].collections[collectionName];

    // Shim in required query params and parse any logical operators.
    options.select = (options.select || [])
      .map(function(def){
       return collection._transformer._transformations[def];
      })
      .filter(function(def){
        return !!def;
      });

    if(!options.select.length) options.select = _.keys(collection.definition);

    connections[connectionName]
      .getConnection()
      .then(function (connection) {
        var query = connection.sobject(collectionName);
        return buildQuery(query, options);
      })
      .nodeify(cb);
  },

  /**
   * create
   */
  create: function (connectionName, collectionName, data, cb) {
    connections[connectionName]
      .getConnection()
      .then(function (connection) {
        return connection
          .sobject(collectionName)
          .create(data, cb);
      })
      .then(errorNet)
      .nodeify(cb);
  },

  /**
   * update
   */
  update: function (connectionName, collectionName, options, values, cb) {
    connections[connectionName]
      .getConnection()
      .then(function (connection) {
        connection
          .sobject(collectionName)
          .update(_.extend(options.where, values), cb);
      })
      .then(errorNet)
      .nodeify(cb);
  },

  /**
   * join
   */
  join: function (connectionName, collectionName, options, cb) {
    var collection = connections[connectionName].collections[collectionName];

    options.select = _.keys(collection.definition);

    Promise
      .all([
        connections[connectionName].getConnection(),
        connections[connectionName].getPluralHash(options.joins)
      ])
      .spread(function (connection, table) {
        var query = connection.sobject(collectionName);
        return buildQuery(query, options, table).then(function (rows) {
          return rows.map(function (row) {
            return remapFields(row, table, options.joins);
          });
        });
      })
      .nodeify(cb);

    function remapFields(row, table, joins) {
      joins.forEach(function (join) {
        var fieldMeta = table[join.child];
        if (!row[fieldMeta.plural]) { return; }
        row[join.alias] = row[fieldMeta.plural].records;
        delete row[fieldMeta.plural];

        if (join.removeParentKey) {
          delete row[join.alias][join.childKey];
        }

        if (table.sub) {
          row[join.alias] = row[join.alias].map(function (subRow) {
            return remapFields(subRow, table.sub, join.criteria.joins);
          });
        }
      });
      return row;
    }
  },

  /**
   * native
   */
  native: function (connectionName, collectionName, cb) {
    connections[connectionName]
      .getConnection()
      .then(function (connection) {
        return connection.sobject(collectionName);
      })
      .nodeify(cb);
  },

  // TODO: Implement teardown process.
  teardown: function(connectionName, cb) { cb(); },
  // TODO: Implement `Model.define()` functionality.
  define: function(connectionName, collectionName, definition, cb) { cb(); },
  // TODO: Implement `Model.describe()` functionality.
  describe: function(connectionName, collectionName, cb) { cb(); },
  // TODO: Implement `Model.drop` functionality.
  drop: function(connectionName, collectionName, relations, cb) { cb(); },
  // TODO: Implement `Model.destroy` functionality.
  destroy: function(connectionName, collectionName, options, cb) { cb(); },

  ///////////////////////////////////////////////////////////////////////////
  // Optional Overrides :: Methods defined here can override built in dynamic
  //                       finders such as `Model.findOrCreate`.

  ///////////////////////////////////////////////////////////////////////////
  // Custom Methods :: Methods defined here will be available on all models
  //                   which are hooked up to this adapter.

};

function errorNet(result) {
  if (result.errors.length > 0) {
    throw new Error(result.errors.split(', '));
  }
  if (result.success !== true) {
    throw new Error('Was not successful');
  }
  return result;
}
