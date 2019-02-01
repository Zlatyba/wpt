def main(request, response):
    response.headers.set("Content-Type", "text/javascript")
    response.content = "import \"%s\";\n" % request.GET.first("url")
