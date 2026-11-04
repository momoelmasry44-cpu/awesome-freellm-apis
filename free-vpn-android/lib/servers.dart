import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// A free public server from the VPN Gate project (University of Tsukuba).
class VpnServer {
  final String host;
  final String ip;
  final int score;
  final int ping;
  final int speed; // bits per second
  final String country;
  final String countryCode;
  final int sessions;
  final String configBase64;

  const VpnServer({
    required this.host,
    required this.ip,
    required this.score,
    required this.ping,
    required this.speed,
    required this.country,
    required this.countryCode,
    required this.sessions,
    required this.configBase64,
  });

  double get mbps => speed / 1000000;

  String get flag {
    final cc = countryCode.toUpperCase();
    if (cc.length != 2) return '🌐';
    return String.fromCharCodes(cc.codeUnits.map((c) => 0x1F1E6 + c - 65));
  }

  Map<String, dynamic> toJson() => {
        'host': host,
        'ip': ip,
        'score': score,
        'ping': ping,
        'speed': speed,
        'country': country,
        'cc': countryCode,
        'sessions': sessions,
        'cfg': configBase64,
      };

  factory VpnServer.fromJson(Map<String, dynamic> j) => VpnServer(
        host: j['host'] as String,
        ip: j['ip'] as String,
        score: j['score'] as int,
        ping: j['ping'] as int,
        speed: j['speed'] as int,
        country: j['country'] as String,
        countryCode: j['cc'] as String,
        sessions: j['sessions'] as int,
        configBase64: j['cfg'] as String,
      );

  /// The .ovpn file, patched to work with the modern OpenVPN engine.
  String buildConfig() {
    final raw = utf8.decode(base64.decode(configBase64), allowMalformed: true);
    final lines = raw.replaceAll('\r\n', '\n').split('\n').map((l) {
      final t = l.trim();
      if (t.startsWith('cipher ') || t.startsWith('ncp-')) return '# $l';
      return l;
    }).join('\n');
    return '$lines\n'
        '# --- added by Free VPN for modern OpenVPN ---\n'
        'data-ciphers AES-128-CBC:AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305:AES-256-CBC\n'
        'data-ciphers-fallback AES-128-CBC\n'
        'tls-cipher DEFAULT:@SECLEVEL=0\n';
  }

  bool get needsAuth =>
      utf8.decode(base64.decode(configBase64), allowMalformed: true)
          .contains('auth-user-pass');
}

/// Parses the CSV returned by https://www.vpngate.net/api/iphone/ .
List<VpnServer> parseVpnGateCsv(String text) {
  final lines = text
      .split(RegExp(r'\r?\n'))
      .where((l) => l.isNotEmpty && !l.startsWith('*'))
      .toList();
  if (lines.isEmpty) return [];
  final header = lines.first.replaceFirst('#', '').split(',');
  int idx(String name) => header.indexOf(name);
  final iHost = idx('HostName'),
      iIp = idx('IP'),
      iScore = idx('Score'),
      iPing = idx('Ping'),
      iSpeed = idx('Speed'),
      iCountry = idx('CountryLong'),
      iCc = idx('CountryShort'),
      iSessions = idx('NumVpnSessions'),
      iCfg = idx('OpenVPN_ConfigData_Base64');
  if (iCfg < 0) return [];

  final servers = <VpnServer>[];
  for (final line in lines.skip(1)) {
    // No field except Message contains commas in practice; the config is
    // always the last column, so split and take it from the end.
    final f = line.split(',');
    if (f.length < header.length) continue;
    final cfg = f.last.trim();
    if (cfg.isEmpty) continue;
    int n(int i) => i < 0 ? 0 : int.tryParse(f[i]) ?? 0;
    servers.add(VpnServer(
      host: f[iHost],
      ip: f[iIp],
      score: n(iScore),
      ping: n(iPing),
      speed: n(iSpeed),
      country: f[iCountry].isEmpty ? 'Unknown' : f[iCountry],
      countryCode: f[iCc],
      sessions: n(iSessions),
      configBase64: cfg,
    ));
  }
  servers.sort((a, b) => b.score.compareTo(a.score));
  return servers;
}

// Where the server list comes from, in order:
//  1. GitHub copy, refreshed every few hours by .github/workflows/update-vpn-servers.yml
//     (GitHub is reachable almost everywhere, even where vpngate.net is blocked)
//  2. The official VPN Gate API
//  3. The last list this phone downloaded
//  4. The list built into the APK (assets/servers.csv)
const _apiUrls = [
  'https://github.com/momoelmasry44-cpu/awesome-freellm-apis/releases/download/vpn-servers/servers.csv',
  'https://www.vpngate.net/api/iphone/',
  'http://www.vpngate.net/api/iphone/',
];
const _cacheKey = 'servers_cache_v1';
const _bundledAsset = 'assets/servers.csv';

class ServerResult {
  final List<VpnServer> servers;

  /// null = fresh from the internet, otherwise where the list came from.
  final String? source;
  ServerResult(this.servers, this.source);
  bool get fromCache => source != null;
}

Future<ServerResult> loadServers() async {
  final prefs = await SharedPreferences.getInstance();
  for (final url in _apiUrls) {
    try {
      final res = await http
          .get(Uri.parse(url), headers: {'User-Agent': 'FreeVPN/1.0'})
          .timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) continue;
      final servers = await compute(
          parseVpnGateCsv, utf8.decode(res.bodyBytes, allowMalformed: true));
      if (servers.isNotEmpty) {
        await prefs.setString(
            _cacheKey, jsonEncode(servers.map((s) => s.toJson()).toList()));
        return ServerResult(servers, null);
      }
    } catch (_) {
      // try the next source
    }
  }
  final cached = prefs.getString(_cacheKey);
  if (cached != null) {
    final list = (jsonDecode(cached) as List)
        .map((e) => VpnServer.fromJson(e as Map<String, dynamic>))
        .toList();
    if (list.isNotEmpty) return ServerResult(list, 'نسخة محفوظة');
  }
  final bundled = await rootBundle.loadString(_bundledAsset);
  final list = await compute(parseVpnGateCsv, bundled);
  if (list.isEmpty) throw Exception('تعذر تحميل السيرفرات، تأكد من الإنترنت');
  return ServerResult(list, 'سيرفرات مدمجة');
}
