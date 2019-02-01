let log = [];

function expect_log(test, expected_log) {
  test.step_func_done(() => {
    const actual_log = log;
    log = [];
    assert_array_equals(actual_log, expected_log, 'fallback log');
  })();
}

const Result = {
  // A built-in module (std:blank) is loaded.
  BUILTIN: "builtin",

  // A fetch error occurs. <script>'s error event is fired.
  FETCH_ERROR: "fetch_error",

  // A parse error occurs. window's error event is fired.
  PARSE_ERROR: "parse_error",

  // The specifier is considered as a relative or absolute URL.
  // Specifier                 Expected log
  // ------------------------- ----------------------
  // ...?name=foo              log:foo
  // data:...log('foo')        foo
  // Others, e.g. @std/blank   relative:@std/blank
  // ------------------------- ----------------------
  // (The last case assumes a file `@std/blank` that logs `relative:@std/blank`
  // exists)
  URL: "URL",
};

// Returns a 4-element array:
// [0]: A script's load event listener /
//      dynamic import promise's resolve handler.
// [1]: A script's error event listener,
// [2]: A window's error event listener,
// [3]: A dynamic import promise's reject handler.
// For dynamic imports, [0] or [3] should be called.
// For other cases, [0] (success), [1] (fetch failure), or [2]+[0] (parse error)
//  should be called.
function getHandlers(t, specifier, expected) {
  let handlers = [
    t.unreached_func("Shouldn't load"),
    t.unreached_func("script's error event shouldn't be fired"),
    t.unreached_func("window's error event shouldn't be fired"),
    t.unreached_func("dynamic import promise shouldn't be rejected")
  ];
  if (expected === Result.FETCH_ERROR) {
    handlers[1] = () => expect_log(t, []);
    handlers[3] = () => expect_log(t, []);
  } else if (expected === Result.PARSE_ERROR) {
    let error_occurred = false;
    handlers[2] = () => { error_occurred = true; };
    handlers[0] = t.step_func(() => {
      // Even if a parse error occurs, load event is fired (after
      // window.onerror is called), so trigger the load handler only if
      // there was no previous window.onerror call.
      assert_true(error_occurred, "window.onerror should be fired");
      expect_log(t, []);
    });
    handlers[3] = t.step_func(() => {
      assert_false(error_occurred,
        "window.onerror shouldn't be fired for dynamic imports");
      expect_log(t, []);
    });
  } else {
    let expected_log;
    if (expected === Result.BUILTIN) {
      expected_log = [];
    } else if (expected === Result.URL) {
      const data_url_log = specifier.match(/data:.*log\.push\('(.*)'\)/);
      if (data_url_log) {
        expected_log = [data_url_log[1]];
      } else if (specifier.indexOf("?name=") >= 0) {
        expected_log = ["log:" + new URL(specifier, document.baseURI).search.substr(6)];
      } else {
        expected_log = ["relative:" + specifier];
      }
    } else {
      expected_log = [expected];
    }
    handlers[0] = () => expect_log(t, expected_log);
  }
  return handlers;
}

// Creates an <iframe> and run a test inside the <iframe>
// to separate the module maps and import maps in each test.
function testInIframe(importMapString, importMapBaseURL, testScript) {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  if (!importMapBaseURL) {
    importMapBaseURL = document.baseURI;
  }
  let content = `
    <script src="/resources/testharness.js"></script>
    <script src="/import-maps/resources/test-helper.js"></script>
    <base href="${importMapBaseURL}">
  `;
  if (importMapString) {
    content += `
      <script type="importmap">
      ${importMapString}
      </sc` + `ript>
    `;
  }
  content += `
    <body>
    <script>
    setup({ allow_uncaught_exception: true });
    ${testScript}
    </sc` + `ript>
  `;
  iframe.contentDocument.write(content);
  iframe.contentDocument.close();
  fetch_tests_from_window(iframe.contentWindow);
}

function testScriptElement(importMapString, importMapBaseURL, specifier, type, expected) {
  testInIframe(importMapString, importMapBaseURL, `
    const t = async_test("${specifier}: <script src type=${type}>");
    const handlers = getHandlers(t, "${specifier}", "${expected}");
    const script = document.createElement("script");
    script.setAttribute("type", "${type}");
    script.setAttribute("src", "${specifier}");
    script.addEventListener("load", handlers[0]);
    script.addEventListener("error", handlers[1]);
    window.addEventListener("error", handlers[2]);
    document.body.appendChild(script);
  `);
}

function testStaticImport(importMapString, importMapBaseURL, specifier, expected) {
  testInIframe(importMapString, importMapBaseURL, `
    const t = async_test("${specifier}: static import");
    const handlers = getHandlers(t, "${specifier}", "${expected}");
    const script = document.createElement("script");
    script.setAttribute("type", "module");
    script.setAttribute("src", "/import-maps/static-import.py?url=" +
                               encodeURIComponent("${specifier}"));
    script.addEventListener("load", handlers[0]);
    script.addEventListener("error", handlers[1]);
    window.addEventListener("error", handlers[2]);
    document.body.appendChild(script);
  `);
}

function testDynamicImport(importMapString, importMapBaseURL, specifier, expected) {
  testInIframe(importMapString, importMapBaseURL, `
    promise_test(t => {
        const p = import("${specifier}");
        const handlers = getHandlers(t, "${specifier}", "${expected}");
        return p.then(handlers[0], handlers[3]);
      },
      "${specifier}: dynamic import");
  `);
}

function doTests(importMapString, importMapBaseURL, tests) {
  window.addEventListener("load", () => {
    for (const specifier in tests) {
      // <script src> (module scripts)
      testScriptElement(importMapString, importMapBaseURL, specifier,
        "module", tests[specifier][0]);

      // <script src> (classic scripts)
      testScriptElement(importMapString, importMapBaseURL, specifier,
        "text/javascript", tests[specifier][1]);

      // static imports.
      testStaticImport(importMapString, importMapBaseURL, specifier,
        tests[specifier][2]);

      // dynamic imports.
      testDynamicImport(importMapString, importMapBaseURL, specifier,
        tests[specifier][3]);
    }
  });
}
