import { useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  FlatList,
  I18nManager,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import data from './data/providers.json';

// Arabic is right-to-left. If the device is not already in RTL mode we flip rows ourselves.
const ROW = I18nManager.isRTL ? 'row' : 'row-reverse';
const START = I18nManager.isRTL ? 'left' : 'right';

const C = {
  bg: '#0E1117',
  card: '#171B24',
  cardHi: '#1F2532',
  border: '#2A3140',
  text: '#E8ECF3',
  muted: '#8B94A7',
  accent: '#4F8CFF',
  green: '#3DD68C',
  amber: '#F5B544',
  pink: '#F06A9B',
};

const SIGNUP = {
  No: { label: 'بدون بطاقة', color: C.green },
  Registration: { label: 'تسجيل فقط', color: C.accent },
  'Phone verification': { label: 'تحقق بالهاتف', color: C.amber },
};
const signupInfo = (s) => SIGNUP[s] || { label: s, color: C.muted };

const MODALITY_AR = {
  text: 'نص',
  vision: 'رؤية',
  image: 'صور',
  reasoning: 'استدلال',
  code: 'برمجة',
  audio: 'صوت',
  video: 'فيديو',
  pdf: 'PDF',
  embedding: 'تضمين',
  embeddings: 'تضمين',
  rerank: 'ترتيب',
  speech: 'كلام',
  decisions: 'قرارات',
};
const MODALITY_FILTERS = ['text', 'vision', 'reasoning', 'code', 'image', 'audio', 'video'];

const TIER_FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'nocard', label: 'بدون بطاقة' },
  { key: 'permanent', label: 'مجاني دائماً' },
  { key: 'renewable', label: 'رصيد متجدد' },
];

const totalModels = data.providers.reduce((n, p) => n + p.freeModels, 0);

async function copy(value, setToast) {
  await Clipboard.setStringAsync(value);
  setToast('تم النسخ ✓');
}

/* ---------- small building blocks ---------- */

function Chip({ label, active, onPress, color = C.accent }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}
    >
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

function Badge({ label, color }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function Stat({ value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CopyRow({ label, value, onCopy }) {
  return (
    <Pressable onPress={() => onCopy(value)} style={styles.copyRow}>
      <Text style={styles.copyLabel}>{label}</Text>
      <View style={[styles.row, { alignItems: 'center' }]}>
        <Text style={styles.mono} numberOfLines={2}>
          {value}
        </Text>
        <Text style={styles.copyIcon}>⧉</Text>
      </View>
    </Pressable>
  );
}

// Renders mixed Arabic/English pieces as separate runs so the bidi order stays correct.
function Meta({ items, sep = '·' }) {
  const parts = items.flatMap((t, i) => (i === 1 && sep ? [sep, t] : [t]));
  return (
    <View style={[styles.row, styles.wrap, { marginTop: 6, gap: 4 }]}>
      {parts.map((t, i) => (
        <Text key={i} style={[styles.muted, { marginTop: 0 }]}>
          {t}
        </Text>
      ))}
    </View>
  );
}

/* ---------- screens ---------- */

function ProviderCard({ p, onPress }) {
  const s = signupInfo(p.signup);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={[styles.row, styles.between]}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {p.name}
        </Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{p.freeModels}</Text>
        </View>
      </View>
      <View style={[styles.row, styles.wrap, { marginTop: 8 }]}>
        <Badge label={s.label} color={s.color} />
        {p.tier === 'renewable' && <Badge label="رصيد متجدد" color={C.pink} />}
        {p.maxContext && <Badge label={`سياق ${p.maxContext}`} color={C.muted} />}
      </View>
      <Text style={styles.muted} numberOfLines={1}>
        {p.modalities.map((m) => MODALITY_AR[m] || m).join(' · ')}
      </Text>
    </Pressable>
  );
}

function ProvidersScreen({ onOpen }) {
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState('all');
  const [modality, setModality] = useState(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.providers
      .filter((p) => {
        if (tier === 'nocard' && p.signup !== 'No') return false;
        if ((tier === 'permanent' || tier === 'renewable') && p.tier !== tier) return false;
        if (modality && !p.modalities.includes(modality)) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.models.some((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.freeModels - a.freeModels);
  }, [query, tier, modality]);

  return (
    <FlatList
      data={list}
      keyExtractor={(p) => p.name}
      contentContainerStyle={styles.listPad}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          <View style={[styles.row, { gap: 10, marginBottom: 14 }]}>
            <Stat value={`${totalModels}+`} label="نموذج مجاني" />
            <Stat value={data.providers.length} label="مزوّد" />
            <Stat value={data.providers.filter((p) => p.signup === 'No').length} label="بدون بطاقة" />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث عن مزوّد أو نموذج…"
            placeholderTextColor={C.muted}
            style={styles.search}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {TIER_FILTERS.map((f) => (
              <Chip key={f.key} label={f.label} active={tier === f.key} onPress={() => setTier(f.key)} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {MODALITY_FILTERS.map((m) => (
              <Chip
                key={m}
                label={MODALITY_AR[m]}
                color={C.green}
                active={modality === m}
                onPress={() => setModality(modality === m ? null : m)}
              />
            ))}
          </ScrollView>
          <Text style={styles.resultCount}>{list.length} نتيجة</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>لا توجد نتائج مطابقة</Text>}
      renderItem={({ item }) => <ProviderCard p={item} onPress={() => onOpen(item)} />}
    />
  );
}

function ProviderDetail({ p, onCopy }) {
  const s = signupInfo(p.signup);
  const snippet = p.baseUrl
    ? `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${p.baseUrl}",\n    api_key="YOUR_API_KEY",\n)\n\nresp = client.chat.completions.create(\n    model="${p.models[0]?.id || 'MODEL_ID'}",\n    messages=[{"role": "user", "content": "Hello!"}],\n)\nprint(resp.choices[0].message.content)`
    : null;

  return (
    <ScrollView contentContainerStyle={styles.listPad}>
      <Text style={styles.h1}>{p.name}</Text>
      <View style={[styles.row, styles.wrap, { marginVertical: 10 }]}>
        <Badge label={s.label} color={s.color} />
        <Badge label={p.tier === 'renewable' ? 'رصيد متجدد' : 'مجاني دائماً'} color={C.pink} />
      </View>

      <View style={[styles.row, { gap: 10, marginBottom: 14 }]}>
        <Stat value={p.freeModels} label="نموذج مجاني" />
        <Stat value={p.maxContext || '—'} label="أقصى سياق" />
      </View>

      {p.creditModel && (
        <View style={styles.card}>
          <Text style={styles.copyLabel}>نظام الرصيد</Text>
          <Text style={styles.body}>{p.creditModel}</Text>
        </View>
      )}

      {p.keyUrl && (
        <Pressable style={styles.primaryBtn} onPress={() => Linking.openURL(p.keyUrl)}>
          <Text style={styles.primaryBtnText}>احصل على مفتاح API ↗</Text>
        </Pressable>
      )}

      {p.baseUrl && <CopyRow label="Base URL" value={p.baseUrl} onCopy={onCopy} />}

      <Text style={styles.h2}>القدرات</Text>
      <View style={[styles.row, styles.wrap]}>
        {p.modalities.map((m) => (
          <Badge key={m} label={MODALITY_AR[m] || m} color={C.green} />
        ))}
      </View>

      {p.models.length > 0 && <Text style={styles.h2}>أفضل النماذج المجانية</Text>}
      {p.models.map((m) => (
        <View key={m.id + m.name} style={styles.card}>
          <View style={[styles.row, styles.between]}>
            <Text style={[styles.cardTitle, { fontSize: 15 }]} numberOfLines={2}>
              {m.name}
            </Text>
            {m.context && <Badge label={m.context} color={C.muted} />}
          </View>
          <Pressable onPress={() => onCopy(m.id)} style={[styles.row, { alignItems: 'center', marginTop: 8 }]}>
            <Text style={styles.mono}>{m.id}</Text>
            <Text style={styles.copyIcon}>⧉</Text>
          </Pressable>
          {m.rateLimit && <Meta items={['الحد:', m.rateLimit]} sep="" />}
          {m.url && (
            <Pressable onPress={() => Linking.openURL(m.url)}>
              <Text style={styles.link}>التفاصيل على freellm.net ↗</Text>
            </Pressable>
          )}
        </View>
      ))}

      {snippet && (
        <>
          <Text style={styles.h2}>مثال سريع (Python)</Text>
          <Pressable onPress={() => onCopy(snippet)} style={styles.codeBox}>
            <Text style={styles.code}>{snippet}</Text>
            <Text style={[styles.link, { textAlign: 'left' }]}>اضغط للنسخ ⧉</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function TopModelsScreen({ onOpenProvider }) {
  return (
    <FlatList
      data={data.topModels}
      keyExtractor={(m) => m.name}
      contentContainerStyle={styles.listPad}
      ListHeaderComponent={
        <Text style={[styles.muted, { marginBottom: 12 }]}>
          النماذج المجانية الأكثر استخداماً هذا الأسبوع (بالتوكنز)
        </Text>
      }
      renderItem={({ item, index }) => (
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => onOpenProvider(item.provider)}
        >
          <View style={[styles.row, { alignItems: 'center', gap: 12 }]}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.name}
              </Text>
              <Meta items={[item.provider, `سياق`, item.context || '—']} />
            </View>
          </View>
          <Text style={[styles.usage]}>{item.usage}</Text>
        </Pressable>
      )}
    />
  );
}

/* ---------- app shell ---------- */

export default function App() {
  const [tab, setTab] = useState('providers');
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1400);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selected) {
        setSelected(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [selected]);

  const openByName = (name) => {
    const p = data.providers.find((x) => x.name === name);
    if (p) setSelected(p);
  };
  const onCopy = (v) => copy(v, setToast);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={[styles.header, styles.row, styles.between]}>
          {selected ? (
            <Pressable onPress={() => setSelected(null)} hitSlop={12}>
              <Text style={styles.back}>→ رجوع</Text>
            </Pressable>
          ) : (
            <View>
              <Text style={styles.appTitle}>Free LLM APIs</Text>
              <Text style={styles.muted}>دليل واجهات الذكاء الاصطناعي المجانية</Text>
            </View>
          )}
          {data.updated && <Text style={styles.updated}>تحديث {data.updated}</Text>}
        </View>

        <View style={{ flex: 1 }}>
          {selected ? (
            <ProviderDetail p={selected} onCopy={onCopy} />
          ) : tab === 'providers' ? (
            <ProvidersScreen onOpen={setSelected} />
          ) : (
            <TopModelsScreen onOpenProvider={openByName} />
          )}
        </View>

        {!selected && (
          <View style={[styles.tabBar, styles.row]}>
            {[
              { key: 'providers', label: 'المزوّدين', icon: '☰' },
              { key: 'top', label: 'الأكثر استخداماً', icon: '★' },
            ].map((t) => (
              <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
                <Text style={[styles.tabIcon, tab === t.key && { color: C.accent }]}>{t.icon}</Text>
                <Text style={[styles.tabLabel, tab === t.key && { color: C.accent }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {toast && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  row: { flexDirection: ROW },
  between: { justifyContent: 'space-between', alignItems: 'center' },
  wrap: { flexWrap: 'wrap', gap: 6 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  appTitle: { color: C.text, fontSize: 22, fontWeight: '800', textAlign: START },
  updated: { color: C.muted, fontSize: 11 },
  back: { color: C.accent, fontSize: 16, fontWeight: '700' },
  listPad: { padding: 16, paddingBottom: 32 },
  stat: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  statValue: { color: C.text, fontSize: 20, fontWeight: '800' },
  statLabel: { color: C.muted, fontSize: 12, marginTop: 2 },
  search: {
    backgroundColor: C.card,
    color: C.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border,
    textAlign: START,
  },
  chips: { flexDirection: ROW, gap: 8, paddingVertical: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  chipText: { color: C.text, fontSize: 13, fontWeight: '600' },
  resultCount: { color: C.muted, fontSize: 12, marginBottom: 8, textAlign: START },
  empty: { color: C.muted, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardPressed: { backgroundColor: C.cardHi },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: '700', flexShrink: 1, textAlign: START },
  countPill: {
    backgroundColor: C.accent + '22',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countText: { color: C.accent, fontWeight: '800', fontSize: 13 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  muted: { color: C.muted, fontSize: 13, marginTop: 6, textAlign: START },
  body: { color: C.text, fontSize: 14, marginTop: 4, textAlign: START },
  h1: { color: C.text, fontSize: 26, fontWeight: '800', textAlign: START },
  h2: { color: C.text, fontSize: 17, fontWeight: '800', marginTop: 20, marginBottom: 10, textAlign: START },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  copyRow: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  copyLabel: { color: C.muted, fontSize: 12, marginBottom: 4, textAlign: START },
  mono: {
    color: C.green,
    fontFamily: 'monospace',
    fontSize: 13,
    flexShrink: 1,
    writingDirection: 'ltr',
  },
  copyIcon: { color: C.muted, fontSize: 16, marginHorizontal: 8 },
  link: { color: C.accent, fontSize: 13, marginTop: 8, textAlign: START },
  codeBox: { backgroundColor: '#0A0D12', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
  code: { color: C.text, fontFamily: 'monospace', fontSize: 12, lineHeight: 18, textAlign: 'left', writingDirection: 'ltr' },
  rank: { color: C.accent, fontSize: 22, fontWeight: '900', width: 30, textAlign: 'center' },
  usage: { color: C.amber, fontWeight: '800', fontSize: 13, marginTop: 8, textAlign: START },
  tabBar: { borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabIcon: { color: C.muted, fontSize: 18 },
  tabLabel: { color: C.muted, fontSize: 12, marginTop: 2, fontWeight: '600' },
  toast: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: C.green,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  toastText: { color: '#06210F', fontWeight: '800' },
});
