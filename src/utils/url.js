export const searchParamToJson = searchString =>
  JSON.parse(
    '{"' +
    decodeURI(searchString).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') +
    '"}'
  );
