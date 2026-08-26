import 'package:business_central_mobile/webview/native_refresh_bridge.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  test('reloads once until the current refresh completes', () async {
    var reloads = 0;
    final bridge = NativeRefreshBridge()..attachReloader(() async => reloads++);

    await bridge.handleMessage(const JavaScriptMessage(message: 'refresh'));
    await bridge.handleMessage(const JavaScriptMessage(message: 'refresh'));

    expect(reloads, 1);
    expect(bridge.isRefreshing, isTrue);

    bridge.completeRefresh();
    await bridge.handleMessage(const JavaScriptMessage(message: 'refresh'));

    expect(reloads, 2);
  });

  test('ignores unrelated WebView messages', () async {
    var reloads = 0;
    final bridge = NativeRefreshBridge()..attachReloader(() async => reloads++);

    await bridge.handleMessage(const JavaScriptMessage(message: 'not-refresh'));

    expect(reloads, 0);
    expect(bridge.isRefreshing, isFalse);
  });
}
