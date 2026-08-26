import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'local_auth_controller.dart';
import '../../../app/application_shell.dart';

class LocalAuthPage extends ConsumerWidget {
  const LocalAuthPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(localAuthControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Business Central')),
      body: auth.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _AuthError(error: error),
        data: (state) => switch (state.view) {
          LocalAuthView.setupRequired => const _CredentialsForm(isSetup: true),
          LocalAuthView.loginRequired => const _CredentialsForm(isSetup: false),
          LocalAuthView.authenticated => ApplicationShellPage(
            contextData: ShellContext(
              merchantName: 'Local merchant',
              shopName: state.shopId ?? 'Assigned shop',
              permissions: state.permissions,
              modules: state.modules,
              shopLocked: true,
              isFullyOffline: true,
            ),
          ),
        },
      ),
    );
  }
}

class _CredentialsForm extends ConsumerStatefulWidget {
  const _CredentialsForm({required this.isSetup});
  final bool isSetup;

  @override
  ConsumerState<_CredentialsForm> createState() => _CredentialsFormState();
}

class _CredentialsFormState extends ConsumerState<_CredentialsForm> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(localAuthControllerProvider);
    final submitting = auth.isLoading;
    final error = auth.hasError ? auth.error.toString() : null;
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
                Icon(
                  widget.isSetup
                      ? Icons.admin_panel_settings_outlined
                      : Icons.lock_outline,
                  size: 56,
                ),
                const SizedBox(height: 16),
                Text(
                  widget.isSetup
                      ? 'Set up this offline workspace'
                      : 'Sign in locally',
                  style: Theme.of(context).textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  widget.isSetup
                      ? 'Create the local merchant owner account. No backend request will be made.'
                      : 'This deployment is fully offline. Use the owner credentials stored on this device.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(
                    labelText: 'Merchant email',
                  ),
                  validator: (value) => value == null || value.trim().isEmpty
                      ? 'Enter an email address.'
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  autofillHints: const [AutofillHints.password],
                  decoration: const InputDecoration(labelText: 'Password'),
                  validator: (value) =>
                      widget.isSetup && (value == null || value.length < 12)
                      ? 'Use at least 12 characters.'
                      : null,
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    error,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: submitting ? null : _submit,
                  child: Text(
                    widget.isSetup ? 'Create local workspace' : 'Sign in',
                  ),
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
    final controller = ref.read(localAuthControllerProvider.notifier);
    if (widget.isSetup) {
      await controller.setup(
        email: _emailController.text,
        password: _passwordController.text,
      );
    } else {
      await controller.login(
        email: _emailController.text,
        password: _passwordController.text,
      );
    }
  }
}

class _AuthError extends StatelessWidget {
  const _AuthError({required this.error});
  final Object error;

  @override
  Widget build(BuildContext context) =>
      Center(child: Text('Local setup error: $error'));
}
