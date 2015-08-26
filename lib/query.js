'use strict';

exports.buildQuery = function buildQuery(sobject, criteria, tables, nested) {
  criteria.where = normalizeWhere(criteria.where);

  var deleteNested = [];

  var nestedSelect = (criteria.select || [])
    .filter(function (field) {
      var separatorIndex = field.indexOf('.');
      var isNested = separatorIndex !== -1;
      if (isNested) {
        deleteNested.push(field.substr(0, separatorIndex));
      }
      return isNested;
    });

  var query = sobject
    .select(criteria.select)
    .where(criteria.where)
    .sort(criteria.sort)
    .limit(criteria.limit)
    .skip(criteria.skip);

  query = (criteria.joins || []).reduce(function (query, join) {
    var parentMeta = tables[join.parent];
    if (!parentMeta) { return query; }

    var childCriteria = join.criteria || {};
    childCriteria.select = join.select;

    query = query.include(tables[join.parent].children[join.child]);
    // TODO support sub sub joins
    query = buildQuery(query, childCriteria, null, true);
    return query.end();
  }, query);

  if (nested) { return query; }

  return query.then(function (rows) {
    return rows.map(function (row) {
      nestedSelect.forEach(function (key) {
        row[key] = getValue(row, key);
      });
      deleteNested.forEach(function (key) {
        delete row[key];
      });
      return row;
    });
  });
};

function getValue(obj, key) {
  var keys = key.split('.');
  return keys.reduce(function (obj, key) {
    if (obj == null) { return null; }
    return obj[key];
  }, obj);
}

function normalizeWhere(fields) {
  return Object.keys(fields || {}).reduce(function (obj, key) {
    var val = fields[key];
    if (!val || typeof val !== 'object') {
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
