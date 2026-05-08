export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.matthewjeffreyabrams.com") {
      url.hostname = "matthewjeffreyabrams.com";
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
