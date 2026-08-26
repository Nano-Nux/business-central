import 'package:business_central_mobile/webview/webview_application.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('uses bounded exponential delays for transient startup failures', () {
    final policy = WebViewNavigationRetryPolicy(maxAttempts: 3);

    expect(policy.nextDelay(), const Duration(milliseconds: 250));
    expect(policy.nextDelay(), const Duration(milliseconds: 500));
    expect(policy.nextDelay(), const Duration(milliseconds: 1000));
    expect(policy.nextDelay(), isNull);
    expect(policy.attempts, 3);
  });

  test('reset allows a manual retry sequence after exhaustion', () {
    final policy = WebViewNavigationRetryPolicy(maxAttempts: 1);

    expect(policy.nextDelay(), isNotNull);
    expect(policy.nextDelay(), isNull);

    policy.reset();

    expect(policy.attempts, 0);
    expect(policy.nextDelay(), const Duration(milliseconds: 250));
  });
}
