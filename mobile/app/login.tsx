import { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { colors } from "@/constants/theme";
import { useMobileAuth } from "@/hooks/use-mobile-auth";

export default function LoginScreen() {
  const { signIn } = useMobileAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setError("");
    try { await signIn(password); router.replace("/(tabs)"); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذّر تسجيل الدخول."); }
    finally { setBusy(false); }
  }
  return <ScreenContainer style={styles.container}>
    <View style={styles.card}>
      <View style={styles.logo}><Text style={styles.logoText}>✦</Text></View>
      <Text style={styles.title}>Seif Study OS</Text>
      <Text style={styles.subtitle}>مذاكرتك في جيبك، وكل إنجازاتك محفوظة على نفس حسابك.</Text>
      <Text style={styles.label}>البريد</Text>
      <TextInput value="seif94803@gmail.com" editable={false} style={[styles.input, styles.ltr]} />
      <Text style={styles.label}>كلمة المرور</Text>
      <TextInput value={password} onChangeText={setPassword} placeholder="أدخل كلمة المرور" placeholderTextColor={colors.muted} secureTextEntry style={[styles.input, styles.ltr]} onSubmitEditing={submit} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable disabled={!password || busy} onPress={submit} style={({ pressed }) => [styles.button, (!password || busy) && styles.disabled, pressed && styles.pressed]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>تسجيل الدخول</Text>}
      </Pressable>
    </View>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 430, backgroundColor: colors.surface, borderRadius: 28, padding: 24, borderWidth: 1, borderColor: colors.border },
  logo: { alignSelf: "center", width: 58, height: 58, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  logoText: { color: "#fff", fontSize: 30 },
  title: { textAlign: "center", fontSize: 26, fontWeight: "800", color: colors.foreground },
  subtitle: { textAlign: "center", color: colors.muted, lineHeight: 22, marginTop: 8, marginBottom: 24 },
  label: { textAlign: "right", color: colors.foreground, fontWeight: "700", marginBottom: 7, marginTop: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, color: colors.foreground, backgroundColor: "#fbfefd", fontSize: 16 },
  ltr: { textAlign: "left", writingDirection: "ltr" },
  error: { color: colors.error, textAlign: "right", marginTop: 10 },
  button: { backgroundColor: colors.primary, borderRadius: 14, minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 20 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.98 }] },
});
