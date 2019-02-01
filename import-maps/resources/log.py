def main(request, response):
    response.headers.set("Content-Type", "text/javascript")
    response.headers.set("Access-Control-Allow-Origin", "*")
    response.content = "log.push(\"log:%s\");\n" % request.GET.first("name")
