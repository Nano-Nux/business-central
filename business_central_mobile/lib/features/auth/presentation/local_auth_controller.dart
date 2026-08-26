import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/local_auth_service.dart';
import '../../../app/providers.dart';

enum LocalAuthView { setupRequired, loginRequired, authenticated }

class LocalAuthState {
  const LocalAuthState({
    required this.view,
    this.merchantId,
    this.shopId,
    this.membershipId,
    this.permissions = const {},
    this.modules = const {},
  });

  final LocalAuthView view;
  final String? merchantId;
  final String? shopId;
  final String? membershipId;
  final Set<String> permissions;
  final Set<String> modules;
}

final localAuthControllerProvider =
    AsyncNotifierProvider<LocalAuthController, LocalAuthState>(
      LocalAuthController.new,
    );

class LocalAuthController extends AsyncNotifier<LocalAuthState> {
  LocalAuthService get _service => ref.read(localAuthServiceProvider);

  @override
  Future<LocalAuthState> build() async {
    final provisioned = await _service.isProvisioned();
    return LocalAuthState(
      view: provisioned
          ? LocalAuthView.loginRequired
          : LocalAuthView.setupRequired,
    );
  }

  Future<void> setup({required String email, required String password}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final result = await _service.provisionOwner(
        email: email,
        password: password,
      );
      final authorization = await _service.authorizationFor(
        merchantId: result.merchantId,
        membershipId: result.membershipId,
      );
      return LocalAuthState(
        view: LocalAuthView.authenticated,
        merchantId: result.merchantId,
        shopId: result.shopId,
        membershipId: result.membershipId,
        permissions: authorization.permissions,
        modules: authorization.modules,
      );
    });
  }

  Future<void> login({required String email, required String password}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final result = await _service.login(email: email, password: password);
      final authorization = await _service.authorizationFor(
        merchantId: result.merchantId,
        membershipId: result.membershipId,
      );
      return LocalAuthState(
        view: LocalAuthView.authenticated,
        merchantId: result.merchantId,
        shopId: result.shopId,
        membershipId: result.membershipId,
        permissions: authorization.permissions,
        modules: authorization.modules,
      );
    });
  }

  Future<void> refreshAuthorization() async {
    final current = state.asData?.value;
    if (current == null ||
        current.view != LocalAuthView.authenticated ||
        current.merchantId == null ||
        current.membershipId == null) {
      return;
    }
    final authorization = await _service.authorizationFor(
      merchantId: current.merchantId!,
      membershipId: current.membershipId!,
    );
    state = AsyncData(
      LocalAuthState(
        view: LocalAuthView.authenticated,
        merchantId: current.merchantId,
        shopId: current.shopId,
        membershipId: current.membershipId,
        permissions: authorization.permissions,
        modules: authorization.modules,
      ),
    );
  }
}
