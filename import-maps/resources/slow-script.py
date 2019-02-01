import time

def main(request, response):
    time.sleep(2)
    return [("Content-type", "text/javascript")], ""
