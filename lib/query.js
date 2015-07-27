'use strict';

exports.buildQuery = function buildQuery(sobject, criteria, tables) {
  criteria.where = normalizeWhere(criteria.where);

  var nestedSelect = (criteria.select || [])
    .filter(function (field) {
      return field.indexOf('.') !== -1;
    });

  var query = sobject
    .select(criteria.select)
    .where(criteria.where)
    .sort(criteria.sort)
    .limit(criteria.limit)
    .skip(criteria.skip);

  query = (criteria.joins || []).reduce(function (query, join) {
    var childCriteria = join.criteria || {};
    childCriteria.select = join.select;
    query = query.include(tables[join.child].plural);
    query = buildQuery(query, childCriteria, tables[join.child].sub);
    return query.end();
  }, query);

  return query.then(function (rows) {
    return rows.map(function (row) {
      nestedSelect.forEach(function (key) {
        var firstKey = key.split('.')[0];
        row[key] = getValue(row, key);
        delete row[firstKey];
      });
      return row;
    });
  });
};

function getValue(obj, key) {
  var keys = key.split('.');
  return keys.reduce(function (obj, key) {
    if (!obj) { return null; }
    return obj[key];
  }, obj);
}

function normalizeWhere(fields) {
  return Object.keys(fields || {}).reduce(function (obj, key) {
    var val = fields[key];
    if (typeof val !== 'object') {
      obj[key] = val;
      return obj;
    }
    obj[key] = Object.keys(val).reduce(function (criteria, criteriaKey) {
      var criteriaValue = val[criteriaKey];
      switch (criteriaKey.toLowerCase()) {
        case 'contains':
          criteriaKey = '$like';
          criteriaValue = '%' + criteriaValue + '%';
          break;
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
