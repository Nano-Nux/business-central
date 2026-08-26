import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_configuration.dart';
import '../features/auth/presentation/local_auth_page.dart';
import '../features/auth/presentation/online_auth_page.dart';
import 'providers.dart';

class BusinessCentralApp extends ConsumerWidget {
  const BusinessCentralApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final configuration = ref.watch(configurationProvider);
    return MaterialApp(
      title: 'Business Central',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff175c67)),
        useMaterial3: true,
      ),
      home: configuration.isFullyOffline
          ? const LocalAuthPage()
          : const OnlineAuthPage(),
    );
  }
}

class RuntimeModePage extends StatelessWidget {
  const RuntimeModePage({required this.configuration, super.key});
  final AppConfiguration configuration;
  @override
  Widget build(BuildContext context) {
    final modeLabel = configuration.isFullyOffline ? 'FULLY OFFLINE' : 'ONLINE';
    return Scaffold(
      appBar: AppBar(title: const Text('Business Central')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.storefront_outlined, size: 64),
              const SizedBox(height: 16),
              Text(
                'Runtime mode: $modeLabel',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(
                configuration.isFullyOffline
                    ? 'Local-only operation is enabled.'
                    : 'Backend: ${configuration.backendUri}',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ConfigurationErrorApp extends StatelessWidget {
  const ConfigurationErrorApp({required this.error, super.key});
  final Object error;
  @override
  Widget build(BuildContext context) => MaterialApp(
    home: Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Configuration error:\n$error',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    ),
  );
}
