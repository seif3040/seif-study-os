import { SafeAreaView } from "react-native-safe-area-context";
import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

export function ScreenContainer({ children, style, ...props }: PropsWithChildren<ViewProps>) {
  return (
    <View style={styles.outer} {...props}>
      <SafeAreaView style={[styles.safe, style]}>{children}</SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: "#f6fbfa" },
  safe: { flex: 1 },
});
