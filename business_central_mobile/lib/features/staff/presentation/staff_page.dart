import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/data/online_auth_api.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../../../app/providers.dart';
import '../data/local_authorization_repository.dart';
import 'staff_controller.dart';

class StaffPage extends ConsumerWidget {
  const StaffPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final users = ref.watch(staffControllerProvider);
    final fullyOffline = ref.watch(configurationProvider).isFullyOffline;
    final localAuth = fullyOffline
        ? ref.watch(localAuthControllerProvider).asData?.value
        : null;
    return users.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('Staff could not load: $error')),
      data: (items) => Scaffold(
        body: RefreshIndicator(
          onRefresh: () => ref.read(staffControllerProvider.notifier).refresh(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                'Staff accounts',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              const Text(
                'Manage merchant memberships, roles, shop assignments, and account status.',
              ),
              const SizedBox(height: 12),
              if (fullyOffline && localAuth?.shopId != null)
                LocalAuthorizationPanel(shopId: localAuth!.shopId!),
              for (final user in items)
                _StaffTile(
                  user: user,
                  onToggle: () => ref
                      .read(staffControllerProvider.notifier)
                      .toggleActive(user),
                ),
              if (items.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('No staff memberships are available.'),
                ),
            ],
          ),
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => _showCreateDialog(context, ref),
          icon: const Icon(Icons.person_add_outlined),
          label: const Text('Add staff'),
        ),
      ),
    );
  }

  Future<void> _showCreateDialog(BuildContext context, WidgetRef ref) async {
    final email = TextEditingController();
    final password = TextEditingController();
    final name = TextEditingController();
    final phone = TextEditingController();
    final role = TextEditingController(text: 'staff');
    final fullyOffline = ref.read(configurationProvider).isFullyOffline;
    final workspace = fullyOffline
        ? null
        : ref.read(onlineWorkspaceControllerProvider).asData?.value;
    final localAuth = fullyOffline
        ? ref.read(localAuthControllerProvider).asData?.value
        : null;
    final shopId = fullyOffline
        ? localAuth?.shopId
        : workspace?.selectedShop.id;
    try {
      final accepted = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Add staff account'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: name,
                  decoration: const InputDecoration(labelText: 'Display name'),
                ),
                TextField(
                  controller: email,
                  decoration: const InputDecoration(labelText: 'Email'),
                ),
                TextField(
                  controller: password,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Temporary password',
                  ),
                ),
                TextField(
                  controller: phone,
                  decoration: const InputDecoration(
                    labelText: 'Phone (optional)',
                  ),
                ),
                TextField(
                  controller: role,
                  decoration: const InputDecoration(labelText: 'Role code'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Create'),
            ),
          ],
        ),
      );
      if (accepted != true ||
          name.text.trim().isEmpty ||
          email.text.trim().isEmpty ||
          password.text.isEmpty) {
        return;
      }
      await ref
          .read(staffControllerProvider.notifier)
          .create(
            email: email.text,
            password: password.text,
            displayName: name.text,
            phone: phone.text,
            roleCode: role.text,
            shopId: shopId,
          );
    } finally {
      for (final controller in [email, password, name, phone, role]) {
        controller.dispose();
      }
    }
  }
}

class LocalAuthorizationPanel extends ConsumerWidget {
  const LocalAuthorizationPanel({required this.shopId, super.key});

  final String shopId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth == null || !auth.permissions.contains('rbac.manage')) {
      return const Card(
        child: ListTile(
          leading: Icon(Icons.lock_outline),
          title: Text('Authorization controls unavailable'),
          subtitle: Text(
            'Only a local owner or rbac.manage administrator can change roles or modules.',
          ),
        ),
      );
    }
    final snapshot = ref.watch(localAuthorizationSnapshotProvider);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: snapshot.when(
          loading: () => const LinearProgressIndicator(),
          error: (error, _) => Text('Authorization could not load: $error'),
          data: (value) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Local authorization',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 4),
              const Text(
                'Changes apply only to this fully offline merchant and shop.',
              ),
              const SizedBox(height: 12),
              for (final role in value.roles)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(role.name),
                  subtitle: Text(
                    role.permissionCodes.isEmpty
                        ? 'No permissions'
                        : role.permissionCodes.join(', '),
                  ),
                  trailing: role.isSystem
                      ? const Chip(label: Text('System'))
                      : TextButton(
                          onPressed: () =>
                              _editRole(context, ref, role, value.permissions),
                          child: const Text('Permissions'),
                        ),
                ),
              const Divider(),
              Text(
                'Shop modules',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              for (final module in value.modules)
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: Text(module.name),
                  subtitle: Text(
                    module.merchantEnabled
                        ? module.code
                        : '${module.code} (merchant disabled)',
                  ),
                  value: module.shopEnabled,
                  onChanged: module.merchantEnabled
                      ? (enabled) =>
                            _toggleModule(context, ref, module, enabled)
                      : null,
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _editRole(
    BuildContext context,
    WidgetRef ref,
    LocalRoleDefinition role,
    List<LocalPermissionDefinition> permissions,
  ) async {
    final selected = {...role.permissionCodes};
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text('${role.name} permissions'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final permission in permissions)
                  CheckboxListTile(
                    value: selected.contains(permission.code),
                    title: Text(permission.code),
                    subtitle: permission.description == null
                        ? null
                        : Text(permission.description!),
                    onChanged: (enabled) => setState(() {
                      if (enabled == true) {
                        selected.add(permission.code);
                      } else {
                        selected.remove(permission.code);
                      }
                    }),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    if (accepted != true || !context.mounted) return;
    try {
      await ref
          .read(staffControllerProvider.notifier)
          .updateLocalRolePermissions(
            roleId: role.id,
            permissionCodes: selected,
          );
    } on Object catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update role: $error')),
        );
      }
    }
  }

  Future<void> _toggleModule(
    BuildContext context,
    WidgetRef ref,
    LocalModuleAccess module,
    bool enabled,
  ) async {
    try {
      await ref
          .read(staffControllerProvider.notifier)
          .setLocalShopModule(
            shopId: shopId,
            moduleCode: module.code,
            enabled: enabled,
          );
    } on Object catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update module: $error')),
        );
      }
    }
  }
}

class _StaffTile extends StatelessWidget {
  const _StaffTile({required this.user, required this.onToggle});
  final OnlineUser user;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: CircleAvatar(
        child: Text(
          user.displayName.isEmpty ? '?' : user.displayName[0].toUpperCase(),
        ),
      ),
      title: Text(user.displayName),
      subtitle: Text(
        '${user.email}\n${user.roles.map((role) => role.code).join(', ')}${user.shopId == null ? ' · All shops' : ' · Shop assigned'}',
      ),
      isThreeLine: true,
      trailing: Switch(value: user.isActive, onChanged: (_) => onToggle()),
    ),
  );
}
