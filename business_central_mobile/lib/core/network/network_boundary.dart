import '../../config/app_configuration.dart';
import 'package:dio/dio.dart';

class NetworkDeniedException implements Exception {
  const NetworkDeniedException();
  @override
  String toString() => 'NetworkDeniedException: network access is disabled.';
}

abstract interface class NetworkClient {
  Future<NetworkResponse> request({
    String method,
    String path,
    Object? body,
    Map<String, String> headers,
  });
}

class NetworkResponse {
  const NetworkResponse({required this.statusCode, this.data});
  final int statusCode;
  final Object? data;
}

class NetworkGate {
  NetworkGate({bool initiallyConnected = false})
    : _connected = initiallyConnected;
  bool _connected;
  bool get isConnected => _connected;

  void setConnected(bool connected) {
    _connected = connected;
  }

  void ensureAllowed() {
    if (!_connected) throw const NetworkDeniedException();
  }
}

class NetworkDeniedClient implements NetworkClient {
  const NetworkDeniedClient();
  @override
  Future<NetworkResponse> request({
    String method = 'GET',
    String path = '/',
    Object? body,
    Map<String, String> headers = const {},
  }) => Future<NetworkResponse>.error(const NetworkDeniedException());
}

class OnlineNetworkClient implements NetworkClient {
  OnlineNetworkClient(this.baseUri, {Dio? dio, NetworkGate? gate})
    : _dio = dio ?? Dio(),
      _gate = gate ?? NetworkGate();
  final Uri baseUri;
  final Dio _dio;
  final NetworkGate _gate;

  NetworkGate get gate => _gate;

  @override
  Future<NetworkResponse> request({
    String method = 'GET',
    String path = '/',
    Object? body,
    Map<String, String> headers = const {},
  }) async {
    _gate.ensureAllowed();
    final normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    final base = baseUri.toString().replaceFirst(RegExp(r'/$'), '');
    final response = await _dio.request<Object?>(
      '$base/$normalizedPath',
      data: body,
      options: Options(
        method: method,
        headers: headers,
        responseType: ResponseType.json,
        validateStatus: (_) => true,
      ),
    );
    return NetworkResponse(
      statusCode: response.statusCode ?? 0,
      data: response.data,
    );
  }
}

NetworkClient buildNetworkClient(AppConfiguration configuration) {
  if (configuration.isFullyOffline) return const NetworkDeniedClient();
  return OnlineNetworkClient(configuration.backendUri!);
}
