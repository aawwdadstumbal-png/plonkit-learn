"""Tests for the local development server."""

import http.client
import json
import os
import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))

import serve  # noqa: E402

APP_DIR = Path(__file__).resolve().parent.parent / "app"


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = serve.make_server(host="127.0.0.1", port=0)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def get(self, path):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        connection.request("GET", path)
        response = connection.getresponse()
        body = response.read()
        # The stdlib sends "Content-type", so the lookup is case insensitive.
        headers = {name.lower(): value for name, value in response.getheaders()}
        connection.close()
        return response.status, headers, body

    def test_serves_index_html(self):
        status, headers, body = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn('id="app"', body.decode("utf-8"))
        self.assertIn("text/html", headers.get("content-type", ""))

    def test_serves_json(self):
        status, headers, body = self.get("/data/index.json")
        self.assertEqual(status, 200)
        self.assertIn("application/json", headers.get("content-type", ""))
        payload = json.loads(body)
        self.assertEqual(len(payload), 138)

    def test_serves_a_webp_with_the_right_content_type(self):
        images = list((APP_DIR / "data" / "img").rglob("*.webp"))
        if not images:
            self.skipTest("no images downloaded yet")
        relative = images[0].relative_to(APP_DIR).as_posix()
        status, headers, body = self.get("/" + relative)
        self.assertEqual(status, 200)
        self.assertIn("image/webp", headers.get("content-type", ""))
        self.assertEqual(body[:4], b"RIFF")

    def test_serves_javascript_as_a_module(self):
        status, headers, body = self.get("/js/store.js")
        self.assertEqual(status, 200)
        self.assertIn("javascript", headers.get("content-type", ""))

    def test_sends_no_store(self):
        _status, headers, _body = self.get("/data/index.json")
        self.assertIn("no-store", headers.get("cache-control", ""))

    def test_refuses_to_escape_the_app_directory(self):
        for path in ("/../tools/serve.py", "/..%2ftools%2fserve.py", "/../package.json"):
            status, _headers, body = self.get(path)
            self.assertNotEqual(status, 200, f"{path} should not be served")
            self.assertNotIn(b"import serve", body)

    def test_a_missing_file_is_a_404(self):
        status, _headers, _body = self.get("/data/guides/nowhere.json")
        self.assertEqual(status, 404)

    def test_the_lan_url_is_printed_with_an_address(self):
        url = serve.lan_url(8000)
        self.assertTrue(url.startswith("http://"))
        self.assertTrue(url.endswith(":8000"))


if __name__ == "__main__":
    unittest.main()
