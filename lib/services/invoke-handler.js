async function invokeHandler(targetHandler, query, headers = {}) {
  let statusCode = 200;
  let responseData = null;
  const fakeReq = { method: "GET", query: query || {}, headers };
  const fakeRes = {
    setHeader() { return fakeRes; },
    status(code) { statusCode = code; return fakeRes; },
    json(data) { responseData = data; return data; },
    send(data) { responseData = data; return data; },
    end() { return null; }
  };
  await targetHandler(fakeReq, fakeRes);
  return { status: statusCode, data: responseData };
}

module.exports = { invokeHandler };
