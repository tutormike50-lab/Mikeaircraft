const baseHandler=require("./overlay-wrapper.js");
const {applyOverlayV12}=require("./overlay/patch-v12.js");

module.exports=async function handler(req,res){
  const originalSend=res.send.bind(res);
  res.send=function patchedSend(body){
    if(typeof body!=="string")return originalSend(body);
    return originalSend(applyOverlayV12(body));
  };
  return baseHandler(req,res);
};
