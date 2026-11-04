import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:free_vpn/servers.dart';

void main() {
  test('parses the VPN Gate CSV and patches the config', () {
    final cfg = base64.encode(utf8.encode(
        'client\r\ndev tun\r\nremote 1.2.3.4 1194\r\ncipher AES-128-CBC\r\n'));
    const header = '#HostName,IP,Score,Ping,Speed,CountryLong,CountryShort,'
        'NumVpnSessions,Uptime,TotalUsers,TotalTraffic,LogType,Operator,'
        'Message,OpenVPN_ConfigData_Base64';
    final csv = '*vpn_servers\r\n$header\r\n'
        'a,1.2.3.4,100,10,5000000,Japan,JP,3,1,1,1,2weeks,op,,$cfg\r\n'
        'b,5.6.7.8,900,20,9000000,Korea Republic of,KR,3,1,1,1,2weeks,op,,$cfg\r\n'
        '*\r\n';
    final servers = parseVpnGateCsv(csv);
    expect(servers.map((s) => s.host), ['b', 'a']);
    expect(servers.first.flag, '🇰🇷');
    final ovpn = servers.first.buildConfig();
    expect(ovpn, contains('# cipher AES-128-CBC'));
    expect(ovpn, contains('data-ciphers-fallback AES-128-CBC'));
    expect(servers.first.needsAuth, isFalse);
  });
}
