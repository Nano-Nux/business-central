import 'package:connectivity_plus/connectivity_plus.dart';

abstract interface class ConnectivityMonitor {
  Future<bool> checkConnected();
  Stream<bool> watchConnected();
}

class ConnectivityPlusMonitor implements ConnectivityMonitor {
  ConnectivityPlusMonitor({Connectivity? connectivity})
    : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  @override
  Future<bool> checkConnected() async {
    final result = await _connectivity.checkConnectivity();
    return result.any(_isUsable);
  }

  @override
  Stream<bool> watchConnected() {
    return _connectivity.onConnectivityChanged.map(
      (results) => results.any(_isUsable),
    );
  }

  bool _isUsable(ConnectivityResult result) =>
      result != ConnectivityResult.none;
}
