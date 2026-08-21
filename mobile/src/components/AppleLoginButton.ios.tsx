import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from 'expo-apple-authentication';
import { StyleSheet } from 'react-native';

interface AppleLoginButtonProps {
  disabled: boolean;
  onPress: () => void;
}

export function AppleLoginButton({ disabled, onPress }: AppleLoginButtonProps) {
  return (
    <AppleAuthenticationButton
      accessibilityLabel="Masuk dengan Apple"
      buttonStyle={AppleAuthenticationButtonStyle.WHITE}
      buttonType={AppleAuthenticationButtonType.SIGN_IN}
      cornerRadius={12}
      onPress={onPress}
      pointerEvents={disabled ? 'none' : 'auto'}
      style={[styles.button, disabled && styles.disabled]}
    />
  );
}

const styles = StyleSheet.create({
  button: { width: '100%', height: 50, marginTop: 8 },
  disabled: { opacity: 0.5 },
});

