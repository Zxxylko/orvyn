// REST encoding is shared by the local bridge and its notification dispatcher.
function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number")
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: fields(value) } };
}
function fields(value) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, encode(item)]),
  );
}
function decode(value) {
  if ("nullValue" in value) return null;
  for (const key of ["stringValue", "booleanValue", "timestampValue"])
    if (key in value) return value[key];
  for (const key of ["integerValue", "doubleValue"])
    if (key in value) return Number(value[key]);
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  return Object.fromEntries(
    Object.entries(value.mapValue?.fields || {}).map(([key, item]) => [
      key,
      decode(item),
    ]),
  );
}
module.exports = { encode, fields, decode };
