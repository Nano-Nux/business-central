import 'package:flutter_test/flutter_test.dart';
import 'package:business_central_mobile/config/app_configuration.dart';

void main() {
  Map<String, String> values(
    String mode, {
    String environment = 'development',
  }) => {
    'APPLICATION_NETWORK_ENVIRONMENT': mode,
    'APPLICATION_ENVIRONMENT': environment,
    'APPLICATION_BACKEND_URL': 'http://localhost:8080/api/v1',
  };

  test('normalizes online values case-insensitively', () {
    expect(
      AppConfiguration.fromEnvironment(values('online')).mode,
      RuntimeMode.online,
    );
    expect(
      AppConfiguration.fromEnvironment(values('ONLINE')).mode,
      RuntimeMode.online,
    );
  });

  test('normalizes offline aliases and does not require a URL', () {
    for (final mode in ['offline', 'OFFLINE', 'FULLY_OFFLINE']) {
      final config = AppConfiguration.fromEnvironment({
        'APPLICATION_NETWORK_ENVIRONMENT': mode,
        'APPLICATION_ENVIRONMENT': 'production',
      });
      expect(config.mode, RuntimeMode.fullyOffline);
      expect(config.backendUri, isNull);
    }
  });

  test('missing and invalid mode fail closed', () {
    expect(
      () => AppConfiguration.fromEnvironment(values('')),
      throwsA(isA<ConfigurationException>()),
    );
    expect(
      () => AppConfiguration.fromEnvironment({}),
      throwsA(isA<ConfigurationException>()),
    );
  });

  test('production HTTP backend is rejected', () {
    expect(
      () => AppConfiguration.fromEnvironment(
        values('ONLINE', environment: 'production'),
      ),
      throwsA(isA<ConfigurationException>()),
    );
  });
}
