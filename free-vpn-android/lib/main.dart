import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:openvpn_flutter/openvpn_flutter.dart';

import 'servers.dart';

void main() => runApp(const FreeVpnApp());

const _bg = Color(0xFF0F172A);
const _card = Color(0xFF1E293B);
const _green = Color(0xFF22C55E);
const _red = Color(0xFFEF4444);
const _amber = Color(0xFFF59E0B);
const _muted = Color(0xFF94A3B8);

class FreeVpnApp extends StatelessWidget {
  const FreeVpnApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Free VPN',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: _bg,
        colorScheme: ColorScheme.fromSeed(
            seedColor: _green, brightness: Brightness.dark),
        useMaterial3: true,
      ),
      builder: (context, child) =>
          Directionality(textDirection: TextDirection.rtl, child: child!),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

enum _Ui { disconnected, connecting, connected }

class _HomePageState extends State<HomePage> {
  late final OpenVPN _vpn;
  List<VpnServer> _servers = [];
  bool _loading = true;
  bool _fromCache = false;
  String? _loadError;

  String? _country; // null = best server automatically
  VpnServer? _current;
  _Ui _ui = _Ui.disconnected;
  VpnStatus? _status;
  final Set<String> _tried = {};
  int _attempts = 0;
  bool _userWantsConnection = false;
  Timer? _timeout;

  @override
  void initState() {
    super.initState();
    _vpn = OpenVPN(
      onVpnStageChanged: (stage, raw) => _onStage(stage),
      onVpnStatusChanged: (s) {
        if (mounted) setState(() => _status = s);
      },
    );
    _vpn.initialize(
      localizedDescription: 'Free VPN',
      lastStage: _onStage,
    );
    _refresh();
  }

  @override
  void dispose() {
    _timeout?.cancel();
    _vpn.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final r = await loadServers();
      setState(() {
        _servers = r.servers;
        _fromCache = r.fromCache;
      });
    } catch (e) {
      setState(() => _loadError = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onStage(VPNStage stage) {
    if (!mounted) return;
    if (stage.isConnected) {
      _timeout?.cancel();
      _attempts = 0;
      _tried.clear();
      setState(() => _ui = _Ui.connected);
    } else if (stage == VPNStage.denied) {
      _timeout?.cancel();
      _userWantsConnection = false;
      setState(() => _ui = _Ui.disconnected);
      _snack('لازم توافق على صلاحية الـ VPN عشان التطبيق يشتغل');
    } else if (stage == VPNStage.error || stage == VPNStage.auth_failed) {
      _tryNext();
    } else if (stage.isDisconnected) {
      if (_ui == _Ui.connecting && _userWantsConnection) {
        _tryNext();
      } else {
        _timeout?.cancel();
        setState(() => _ui = _Ui.disconnected);
      }
    } else if (stage.isConnecting) {
      setState(() => _ui = _Ui.connecting);
    }
  }

  List<String> get _countries {
    final s = _servers.map((e) => e.country).toSet().toList()..sort();
    return s;
  }

  VpnServer? _pick() {
    var pool = _country == null
        ? _servers
        : _servers.where((s) => s.country == _country).toList();
    var fresh = pool.where((s) => !_tried.contains(s.host)).toList();
    if (fresh.isEmpty) {
      _tried.clear();
      fresh = pool;
    }
    return fresh.isEmpty ? null : fresh.first;
  }

  Future<void> _connect() async {
    _attempts++;
    if (_attempts > 10) {
      _userWantsConnection = false;
      await _vpn.disconnect();
      setState(() => _ui = _Ui.disconnected);
      _snack('تعذر الاتصال بعد عدة محاولات، جرّب دولة تانية أو حدّث القائمة');
      return;
    }
    final server = _pick();
    if (server == null) {
      _snack('مفيش سيرفرات متاحة، اسحب لتحت عشان تحدّث القائمة');
      return;
    }
    _tried.add(server.host);
    setState(() {
      _current = server;
      _ui = _Ui.connecting;
    });
    _timeout?.cancel();
    _timeout = Timer(const Duration(seconds: 30), () {
      if (_ui == _Ui.connecting && _userWantsConnection) _tryNext();
    });
    try {
      final ok = await _vpn.connect(
        server.buildConfig(),
        '${server.flag} ${server.country}',
        username: server.needsAuth ? 'vpn' : null,
        password: server.needsAuth ? 'vpn' : null,
        certIsRequired: false,
      );
      if (!ok) {
        _timeout?.cancel();
        _userWantsConnection = false;
        setState(() => _ui = _Ui.disconnected);
      }
    } on PlatformException catch (e) {
      _timeout?.cancel();
      _userWantsConnection = false;
      setState(() => _ui = _Ui.disconnected);
      _snack('خطأ: ${e.message ?? e.code}');
    }
  }

  bool _switching = false;
  Future<void> _tryNext() async {
    if (!_userWantsConnection || _switching) return;
    _switching = true;
    _timeout?.cancel();
    try {
      await _vpn.disconnect();
      await Future.delayed(const Duration(milliseconds: 600));
      if (_userWantsConnection) await _connect();
    } finally {
      _switching = false;
    }
  }

  Future<void> _toggle() async {
    if (_ui == _Ui.disconnected) {
      _userWantsConnection = true;
      _attempts = 0;
      await _connect();
    } else {
      _userWantsConnection = false;
      _timeout?.cancel();
      await _vpn.disconnect();
      setState(() => _ui = _Ui.disconnected);
    }
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg, textAlign: TextAlign.right)));
  }

  Future<void> _chooseCountry() async {
    final counts = <String, int>{};
    for (final s in _servers) {
      counts[s.country] = (counts[s.country] ?? 0) + 1;
    }
    final flags = {for (final s in _servers) s.country: s.flag};
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: _card,
      isScrollControlled: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        builder: (ctx, scroll) => ListView(
          controller: scroll,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('اختر الدولة',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ),
            ListTile(
              leading: const Text('⭐', style: TextStyle(fontSize: 24)),
              title: const Text('أفضل سيرفر تلقائي'),
              trailing: _country == null
                  ? const Icon(Icons.check, color: _green)
                  : null,
              onTap: () => Navigator.pop(ctx, ''),
            ),
            for (final c in _countries)
              ListTile(
                leading: Text(flags[c] ?? '🌐',
                    style: const TextStyle(fontSize: 24)),
                title: Text(c),
                subtitle: Text('${counts[c]} سيرفر'),
                trailing: _country == c
                    ? const Icon(Icons.check, color: _green)
                    : null,
                onTap: () => Navigator.pop(ctx, c),
              ),
          ],
        ),
      ),
    );
    if (choice == null) return;
    setState(() => _country = choice.isEmpty ? null : choice);
    _tried.clear();
    if (_ui != _Ui.disconnected) {
      // Switch to the new country right away.
      _userWantsConnection = true;
      _attempts = 0;
      await _connect();
    }
  }

  String _bytes(String? v) {
    final b = double.tryParse(v ?? '') ?? 0;
    if (b > 1 << 30) return '${(b / (1 << 30)).toStringAsFixed(2)} GB';
    if (b > 1 << 20) return '${(b / (1 << 20)).toStringAsFixed(1)} MB';
    if (b > 1 << 10) return '${(b / (1 << 10)).toStringAsFixed(0)} KB';
    return '${b.toStringAsFixed(0)} B';
  }

  @override
  Widget build(BuildContext context) {
    final color = switch (_ui) {
      _Ui.connected => _green,
      _Ui.connecting => _amber,
      _Ui.disconnected => _red,
    };
    final statusText = switch (_ui) {
      _Ui.connected => 'متصل ✔',
      _Ui.connecting => 'جاري الاتصال...',
      _Ui.disconnected => 'غير متصل',
    };

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const SizedBox(height: 8),
              const Text('🛡️ Free VPN',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
              const Text('سيرفرات مجانية من مشروع VPN Gate',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: _muted)),
              const SizedBox(height: 40),
              Center(
                child: GestureDetector(
                  onTap: _loading && _servers.isEmpty ? null : _toggle,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    width: 190,
                    height: 190,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: color.withValues(alpha: 0.15),
                      border: Border.all(color: color, width: 6),
                      boxShadow: [
                        BoxShadow(
                            color: color.withValues(alpha: 0.4),
                            blurRadius: 40,
                            spreadRadius: 2)
                      ],
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _ui == _Ui.connecting
                            ? SizedBox(
                                width: 56,
                                height: 56,
                                child: CircularProgressIndicator(
                                    color: color, strokeWidth: 5))
                            : Icon(Icons.power_settings_new,
                                size: 70, color: color),
                        const SizedBox(height: 8),
                        Text(
                          _ui == _Ui.disconnected ? 'اتصال' : 'قطع الاتصال',
                          style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: color),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text('● $statusText',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 20, fontWeight: FontWeight.bold, color: color)),
              if (_current != null && _ui != _Ui.disconnected) ...[
                const SizedBox(height: 6),
                Text(
                  '${_current!.flag} ${_current!.country} • ${_current!.ip}\n'
                  '${_current!.ping}ms • ${_current!.mbps.toStringAsFixed(1)} Mbps',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: _muted),
                ),
              ],
              if (_ui == _Ui.connected && _status != null) ...[
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _stat(Icons.timer, _status!.duration ?? '00:00:00'),
                    _stat(Icons.arrow_downward, _bytes(_status!.byteIn)),
                    _stat(Icons.arrow_upward, _bytes(_status!.byteOut)),
                  ],
                ),
              ],
              const SizedBox(height: 32),
              Material(
                color: _card,
                borderRadius: BorderRadius.circular(16),
                child: ListTile(
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16)),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  leading: Text(
                      _country == null
                          ? '⭐'
                          : (_servers
                                  .where((s) => s.country == _country)
                                  .firstOrNull
                                  ?.flag ??
                              '🌐'),
                      style: const TextStyle(fontSize: 28)),
                  title: Text(_country ?? 'أفضل سيرفر تلقائي'),
                  subtitle: Text(
                    _loading
                        ? 'جاري تحميل السيرفرات...'
                        : _loadError != null
                            ? 'فشل التحميل، اسحب لتحت للتحديث'
                            : '${_servers.length} سيرفر متاح'
                                '${_fromCache ? ' (نسخة محفوظة)' : ''}',
                    style: const TextStyle(color: _muted),
                  ),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: _servers.isEmpty ? null : _chooseCountry,
                ),
              ),
              const SizedBox(height: 12),
              TextButton.icon(
                onPressed: _loading ? null : _refresh,
                icon: const Icon(Icons.refresh),
                label: const Text('تحديث قائمة السيرفرات'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _stat(IconData icon, String value) => Column(
        children: [
          Icon(icon, color: _muted, size: 20),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      );
}
