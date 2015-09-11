'use strict';

var assign = require('object-assign');
var flatten = require('flat');

exports.Query = Query;

function Query(sobject, criteria, tableMeta) {
  criteria.where = normalizeWhere(criteria.where);
  criteria.joins = criteria.joins || [];

  this._select = criteria.select;

  var children = [];

  var query = sobject
    .select(criteria.select)
    .where(criteria.where)
    .sort(criteria.sort)
    .limit(criteria.limit)
    .skip(criteria.skip);

  this._query = criteria.joins.reduce(function (subQuery, join) {
    var parentMeta = tableMeta[join.parent];
    // If we don't have metadata on this table/relationship, it's not a valid
    // join and salesforce will scream. We won't have metadata on the table if
    // the table wasn't included as a collection
    if (!parentMeta || !parentMeta.children[join.child]) { return subQuery; }

    var childCriteria = join.criteria || {};
    childCriteria.select = join.select;

    subQuery = subQuery.include(parentMeta.children[join.child]);
    var newQuery = new Query(subQuery, childCriteria, tableMeta);

    children.push({
      key: parentMeta.children[join.child],
      alias: join.alias,
      select: join.select,
      children: newQuery._children
    });

    subQuery = newQuery._query;
    return subQuery.end();
  }, query);

  this._children = children;
}

Query.prototype.run = function () {
  var children = this._children;
  var select = this._select;
  return this._query.then(function (rows) {
    return rows.map(function (row) {
      return flattenRow(row, children, select);
    });
  });
};

function flattenRow(row, children, select) {
  var childKeys = {};
  children.forEach(function (child) {
    if (row[child.key]) {
      childKeys[child.alias] = (row[child.key].records || []).map(function (subRow) {
        return flattenRow(subRow, child.children, child.select);
      });
      delete row[child.key];
    }
  });
  return assign(flatten(mapEnsure(row, select)), childKeys);
}

function normalizeWhere(fields) {
  return Object.keys(fields || {}).reduce(function (obj, key) {
    var val = fields[key];
    // If a value is null or it's not an object, we just leave it as is
    if (!val || typeof val !== 'object') {
      obj[key] = val;
      return obj;
    }
    // Otherwise, we go through an normalize the different things they can do
    // to modify the criteria (with like, greaterthan, and such)
    obj[key] = Object.keys(val).reduce(function (criteria, criteriaKey) {
      var criteriaValue = val[criteriaKey];
      switch (criteriaKey.toLowerCase()) {
        case 'contains':
          criteriaKey = '$like';
          criteriaValue = '%' + criteriaValue + '%';
          break;
        case 'startsWith':
          criteriaKey = '$like';
          criteriaValue = criteriaValue + '%';
          break;
        case 'endsWith':
          criteriaKey = '$like';
          criteriaValue = '%' + criteriaValue;
          break;
        case '!': criteriaKey = '$ne'; break;
        case 'like': criteriaKey = '$like'; break;
        case '>': criteriaKey = '$gt'; break;
        case '<': criteriaKey = '$lt'; break;
        case '>=': criteriaKey = '$gte'; break;
        case '<=': criteriaKey = '$lte'; break;
      }
      criteria[criteriaKey] = criteriaValue;
      return criteria;
    }, {});
    return obj;
  }, {});
}

function getValue(obj, key) {
  var keys = key.split('.');
  return keys.reduce(function (obj, key) {
    if (obj == null) { return null; }
    return obj[key];
  }, obj);
}

function mapEnsure(obj, select) {
  return select.reduce(function (newObj, key) {
    newObj[key] = getValue(obj, key);
    return newObj;
  }, {});
}
