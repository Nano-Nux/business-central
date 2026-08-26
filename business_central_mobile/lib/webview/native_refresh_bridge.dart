import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';

class NativeRefreshBridge {
  static const channelName = 'BusinessCentralRefreshChannel';

  Future<void> Function()? _reload;
  bool _refreshing = false;

  @visibleForTesting
  bool get isRefreshing => _refreshing;

  void attach(WebViewController controller) {
    _reload = controller.reload;
  }

  @visibleForTesting
  void attachReloader(Future<void> Function() reload) {
    _reload = reload;
  }

  Future<void> handleMessage(JavaScriptMessage message) async {
    final reload = _reload;
    if (message.message != 'refresh' || reload == null || _refreshing) return;
    _refreshing = true;
    try {
      await reload();
    } on Object {
      _refreshing = false;
      rethrow;
    }
  }

  void completeRefresh() {
    _refreshing = false;
  }
}
