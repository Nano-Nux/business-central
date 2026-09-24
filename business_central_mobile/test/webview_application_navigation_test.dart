import 'package:business_central_mobile/webview/webview_application.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  group('WebViewNavigationPolicy', () {
    final portalUri = Uri.parse('https://portal.business-central.example:8443');

    test('exposes expected custom User-Agent string', () {
      expect(
        WebViewNavigationPolicy.customUserAgent,
        'business-central-mobile/1.0',
      );
    });

    test('isSameOrigin correctly checks scheme, host, and port', () {
      expect(
        WebViewNavigationPolicy.isSameOrigin(
          Uri.parse('https://portal.business-central.example:8443/dashboard'),
          portalUri,
        ),
        isTrue,
      );

      // Different port
      expect(
        WebViewNavigationPolicy.isSameOrigin(
          Uri.parse('https://portal.business-central.example:3000/dashboard'),
          portalUri,
        ),
        isFalse,
      );

      // Different host
      expect(
        WebViewNavigationPolicy.isSameOrigin(
          Uri.parse('https://accounts.google.com/o/oauth2/v2/auth'),
          portalUri,
        ),
        isFalse,
      );

      // Different scheme
      expect(
        WebViewNavigationPolicy.isSameOrigin(
          Uri.parse('http://portal.business-central.example:8443/dashboard'),
          portalUri,
        ),
        isFalse,
      );
    });

    test('navigates internally for same-origin URLs', () {
      final launched = <Uri>[];
      final decision = WebViewNavigationPolicy.decideNavigation(
        url: 'https://portal.business-central.example:8443/pos/checkout',
        portalUri: portalUri,
        onExternalLaunch: launched.add,
      );

      expect(decision, NavigationDecision.navigate);
      expect(launched, isEmpty);
    });

    test('navigates internally for blob: and data: URLs', () {
      final launched = <Uri>[];

      final blobDecision = WebViewNavigationPolicy.decideNavigation(
        url:
            'blob:https://portal.business-central.example:8443/d8c1c54e-4f7b-402a-9f50',
        portalUri: portalUri,
        onExternalLaunch: launched.add,
      );
      expect(blobDecision, NavigationDecision.navigate);
      expect(launched, isEmpty);

      final dataDecision = WebViewNavigationPolicy.decideNavigation(
        url: 'data:application/pdf;base64,JVBERi0xLjQK...',
        portalUri: portalUri,
        onExternalLaunch: launched.add,
      );
      expect(dataDecision, NavigationDecision.navigate);
      expect(launched, isEmpty);
    });

    test(
      'prevents internal navigation and dispatches external launch for external web links',
      () {
        final launched = <Uri>[];
        final decision = WebViewNavigationPolicy.decideNavigation(
          url: 'https://checkout.stripe.com/c/pay/cs_live_12345',
          portalUri: portalUri,
          onExternalLaunch: launched.add,
        );

        expect(decision, NavigationDecision.prevent);
        expect(launched, hasLength(1));
        expect(launched.single.host, 'checkout.stripe.com');
      },
    );

    test(
      'prevents internal navigation and dispatches external launch for tel:, mailto:, sms: schemes',
      () {
        final launched = <Uri>[];

        // tel:
        var decision = WebViewNavigationPolicy.decideNavigation(
          url: 'tel:+1234567890',
          portalUri: portalUri,
          onExternalLaunch: launched.add,
        );
        expect(decision, NavigationDecision.prevent);
        expect(launched.last.scheme, 'tel');

        // mailto:
        decision = WebViewNavigationPolicy.decideNavigation(
          url: 'mailto:support@business-central.example',
          portalUri: portalUri,
          onExternalLaunch: launched.add,
        );
        expect(decision, NavigationDecision.prevent);
        expect(launched.last.scheme, 'mailto');

        // sms:
        decision = WebViewNavigationPolicy.decideNavigation(
          url: 'sms:+1234567890?body=Invoice',
          portalUri: portalUri,
          onExternalLaunch: launched.add,
        );
        expect(decision, NavigationDecision.prevent);
        expect(launched.last.scheme, 'sms');

        expect(launched, hasLength(3));
      },
    );

    test('prevents navigation for invalid or empty URLs', () {
      final launched = <Uri>[];
      final decision = WebViewNavigationPolicy.decideNavigation(
        url: '',
        portalUri: portalUri,
        onExternalLaunch: launched.add,
      );

      expect(decision, NavigationDecision.prevent);
    });
  });
}
