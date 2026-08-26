enum RuntimeMode { online, fullyOffline }

class ConfigurationException implements Exception {
  const ConfigurationException(this.message);
  final String message;
  @override
  String toString() => 'ConfigurationException: $message';
}

class AppConfiguration {
  const AppConfiguration({
    required this.mode,
    required this.environment,
    this.backendUri,
  });
  final RuntimeMode mode;
  final String environment;
  final Uri? backendUri;
  bool get isFullyOffline => mode == RuntimeMode.fullyOffline;

  static AppConfiguration fromEnvironment(Map<String, String> values) {
    final rawMode = values['APPLICATION_NETWORK_ENVIRONMENT']?.trim();
    final mode = switch (rawMode?.toUpperCase()) {
      'ONLINE' => RuntimeMode.online,
      'OFFLINE' || 'FULLY_OFFLINE' => RuntimeMode.fullyOffline,
      _ => throw const ConfigurationException(
        'APPLICATION_NETWORK_ENVIRONMENT must be ONLINE or FULLY_OFFLINE.',
      ),
    };
    final environment = values['APPLICATION_ENVIRONMENT']?.trim();
    if (environment == null || environment.isEmpty) {
      throw const ConfigurationException(
        'APPLICATION_ENVIRONMENT must be configured.',
      );
    }
    if (mode == RuntimeMode.fullyOffline) {
      return AppConfiguration(mode: mode, environment: environment);
    }
    final rawUrl = values['APPLICATION_BACKEND_URL']?.trim();
    if (rawUrl == null || rawUrl.isEmpty) {
      throw const ConfigurationException(
        'APPLICATION_BACKEND_URL is required in ONLINE mode.',
      );
    }
    final uri = Uri.tryParse(rawUrl);
    if (uri == null ||
        !uri.isAbsolute ||
        uri.host.isEmpty ||
        (uri.scheme != 'http' && uri.scheme != 'https')) {
      throw const ConfigurationException(
        'APPLICATION_BACKEND_URL must be an absolute HTTP(S) URL.',
      );
    }
    if (environment.toLowerCase() == 'production' && uri.scheme == 'http') {
      throw const ConfigurationException(
        'Production ONLINE deployments require HTTPS for the backend URL.',
      );
    }
    return AppConfiguration(
      mode: mode,
      environment: environment,
      backendUri: uri,
    );
  }
}
