import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/online_auth_api.dart';
import 'online_auth_controller.dart';
import '../../sync/presentation/sync_controller.dart';
import 'workspace_controller.dart';
import '../../../app/application_shell.dart';

class OnlineAuthPage extends ConsumerWidget {
  const OnlineAuthPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(onlineAuthControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Business Central')),
      body: auth.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _OnlineCredentialsForm(error: error),
        data: (session) => session == null
            ? const _OnlineCredentialsForm()
            : _OnlineAuthenticatedView(session: session),
      ),
    );
  }
}

class _OnlineCredentialsForm extends ConsumerStatefulWidget {
  const _OnlineCredentialsForm({this.error});
  final Object? error;

  @override
  ConsumerState<_OnlineCredentialsForm> createState() =>
      _OnlineCredentialsFormState();
}

class _OnlineCredentialsFormState
    extends ConsumerState<_OnlineCredentialsForm> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _merchantId = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _merchantId.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(onlineAuthControllerProvider);
    final error = widget.error ?? (state.hasError ? state.error : null);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.storefront_outlined, size: 64),
                const SizedBox(height: 16),
                Text(
                  'Sign in to your workspace',
                  style: Theme.of(context).textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                const Text(
                  'The backend remains authoritative for permissions, modules, and business state.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Email'),
                  validator: (value) => value == null || value.trim().isEmpty
                      ? 'Enter your email.'
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _password,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Password'),
                  validator: (value) => value == null || value.isEmpty
                      ? 'Enter your password.'
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _merchantId,
                  decoration: const InputDecoration(
                    labelText: 'Merchant ID (optional)',
                  ),
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    error.toString(),
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: state.isLoading ? null : _submit,
                  child: const Text('Sign in'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    await ref
        .read(onlineAuthControllerProvider.notifier)
        .login(
          email: _email.text,
          password: _password.text,
          merchantId: _merchantId.text,
        );
  }
}

class _OnlineAuthenticatedView extends ConsumerWidget {
  const _OnlineAuthenticatedView({required this.session});
  final OnlineSession session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(syncWorkerProvider);
    final workspace = ref.watch(onlineWorkspaceControllerProvider);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: workspace.when(
          loading: () => const CircularProgressIndicator(),
          error: (error, _) => Text('Workspace could not load: $error'),
          data: (value) => value == null
              ? const Text('No authenticated workspace.')
              : ApplicationShellPage(
                  contextData: ShellContext(
                    merchantName: value.merchant.name,
                    shopName: value.selectedShop.name,
                    permissions: {
                      for (final role in value.user.roles)
                        ...role.permissionCodes,
                    },
                    modules: value.selectedShop.moduleCodes.toSet(),
                    shops: [
                      for (final shop in value.shops)
                        ShellShop(id: shop.id, name: shop.name),
                    ],
                    selectedShopId: value.selectedShop.id,
                    shopLocked: !value.canSelectShop,
                    onShopSelected: (shopId) => ref
                        .read(onlineWorkspaceControllerProvider.notifier)
                        .selectShop(shopId),
                  ),
                ),
        ),
      ),
    );
  }
}
