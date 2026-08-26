import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/network/network_boundary.dart';
import '../data/online_auth_api.dart';

final onlineAuthControllerProvider =
    AsyncNotifierProvider<OnlineAuthController, OnlineSession?>(
      OnlineAuthController.new,
    );

class OnlineAuthController extends AsyncNotifier<OnlineSession?> {
  OnlineAuthApi get _api => ref.read(onlineAuthApiProvider);

  @override
  Future<OnlineSession?> build() async {
    final connected = await ref.read(networkReadinessProvider.future);
    if (!connected) return null;
    final store = ref.read(secureSessionStoreProvider);
    final accessToken = await store.readAccessToken();
    final refreshToken = await store.readRefreshToken();
    if (accessToken == null || refreshToken == null) return null;
    try {
      final user = await _api.currentUser();
      return OnlineSession(
        accessToken: accessToken,
        refreshToken: refreshToken,
        tokenType: 'Bearer',
        expiresAt: DateTime.now().toUtc(),
        user: user,
      );
    } on ApiException {
      await store.clear();
      return null;
    }
  }

  Future<void> login({
    required String email,
    required String password,
    String? merchantId,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final connected = await ref.read(networkReadinessProvider.future);
      if (!connected) throw const NetworkDeniedException();
      return _api.login(
        email: email,
        password: password,
        merchantId: merchantId,
      );
    });
  }

  Future<void> logout() async {
    try {
      await _api.logout();
    } finally {
      state = const AsyncData(null);
    }
  }
}
