import 'dart:async';

import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_configuration.dart';
import '../core/network/network_boundary.dart';
import '../core/network/connectivity_monitor.dart';
import '../core/database/app_database.dart';
import '../core/security/password_hasher.dart';
import '../core/security/secure_session_store.dart';
import '../features/auth/domain/local_auth_service.dart';
import '../features/auth/data/online_auth_api.dart';

final configurationProvider = Provider<AppConfiguration>((ref) {
  return AppConfiguration.fromEnvironment(dotenv.env);
});

final networkClientProvider = Provider<NetworkClient>((ref) {
  final configuration = ref.watch(configurationProvider);
  final client = buildNetworkClient(configuration);
  if (client case final OnlineNetworkClient onlineClient) {
    final monitor = ref.watch(connectivityMonitorProvider);
    ref.listen(connectivityProvider, (_, next) {
      next.whenData(onlineClient.gate.setConnected);
    });
    unawaited(
      monitor
          .checkConnected()
          .then(onlineClient.gate.setConnected)
          .catchError((_) => onlineClient.gate.setConnected(false)),
    );
  }
  return client;
});

final connectivityMonitorProvider = Provider<ConnectivityMonitor>((ref) {
  final configuration = ref.watch(configurationProvider);
  if (configuration.isFullyOffline) {
    throw const ConfigurationException(
      'Connectivity monitoring is unavailable in FULLY_OFFLINE mode.',
    );
  }
  return ConnectivityPlusMonitor();
});

final connectivityProvider = StreamProvider<bool>((ref) {
  return ref.watch(connectivityMonitorProvider).watchConnected();
});

final networkReadinessProvider = FutureProvider<bool>((ref) async {
  final configuration = ref.watch(configurationProvider);
  if (configuration.isFullyOffline) return false;
  final client = ref.watch(networkClientProvider);
  final connected = await ref
      .watch(connectivityMonitorProvider)
      .checkConnected();
  if (client case final OnlineNetworkClient onlineClient) {
    onlineClient.gate.setConnected(connected);
  }
  return connected;
});

final databaseKeyProvider = Provider<String?>((ref) => null);

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final database = AppDatabase(encryptionKey: ref.watch(databaseKeyProvider));
  ref.onDispose(database.close);
  return database;
});

final passwordHasherProvider = Provider<PasswordHasher>((ref) {
  return PasswordHasher();
});

final secureSessionStoreProvider = Provider<SecureSessionStore>((ref) {
  return PlatformSecureSessionStore();
});

final localAuthServiceProvider = Provider<LocalAuthService>((ref) {
  return LocalAuthService(
    database: ref.watch(appDatabaseProvider),
    passwordHasher: ref.watch(passwordHasherProvider),
  );
});

final onlineAuthApiProvider = Provider<OnlineAuthApi>((ref) {
  final configuration = ref.watch(configurationProvider);
  if (configuration.isFullyOffline) {
    throw const ConfigurationException(
      'The ONLINE authentication API is unavailable in FULLY_OFFLINE mode.',
    );
  }
  return OnlineAuthApi(
    client: ref.watch(networkClientProvider),
    sessionStore: ref.watch(secureSessionStoreProvider),
  );
});
