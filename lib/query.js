'use strict';

exports.buildQuery = function buildQuery(sobject, criteria, tables) {
  criteria.where = normalizeWhere(criteria.where);

  var query = sobject
    .select(criteria.select)
    .where(criteria.where)
    .sort(criteria.sort)
    .limit(criteria.limit)
    .skip(criteria.skip);

  return (criteria.joins || []).reduce(function (query, join) {
    var childCriteria = join.criteria || {};
    childCriteria.select = join.select;
    query = query.include(tables[join.child].plural);
    query = buildQuery(query, childCriteria, tables[join.child].sub);
    return query.end();
  }, query);
};

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
