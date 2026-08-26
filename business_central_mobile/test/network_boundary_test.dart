import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:business_central_mobile/config/app_configuration.dart';
import 'package:business_central_mobile/core/network/network_boundary.dart';

void main() {
  test(
    'fully offline builds a denying client and never exposes a backend URI',
    () async {
      final configuration = AppConfiguration.fromEnvironment({
        'APPLICATION_NETWORK_ENVIRONMENT': 'FULLY_OFFLINE',
        'APPLICATION_ENVIRONMENT': 'production',
      });
      final client = buildNetworkClient(configuration);
      expect(client, isA<NetworkDeniedClient>());
      expect(() => client.request(), throwsA(isA<NetworkDeniedException>()));
    },
  );

  test('online builds a client only after URL validation', () {
    final configuration = AppConfiguration.fromEnvironment({
      'APPLICATION_NETWORK_ENVIRONMENT': 'ONLINE',
      'APPLICATION_ENVIRONMENT': 'development',
      'APPLICATION_BACKEND_URL': 'http://10.0.2.2:8080/api/v1',
    });
    final client = buildNetworkClient(configuration);
    expect(client, isA<OnlineNetworkClient>());
    expect((client as OnlineNetworkClient).baseUri.host, '10.0.2.2');
  });

  test(
    'temporary disconnection blocks API transport before Dio is called',
    () async {
      var dioCalled = false;
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              dioCalled = true;
              handler.reject(DioException(requestOptions: options));
            },
          ),
        );
      final gate = NetworkGate();
      final client = OnlineNetworkClient(
        Uri.parse('http://localhost:8080/api/v1'),
        dio: dio,
        gate: gate,
      );

      await expectLater(
        client.request(method: 'GET', path: '/auth/me'),
        throwsA(isA<NetworkDeniedException>()),
      );
      expect(dioCalled, isFalse);
      gate.setConnected(true);
    },
  );
}
