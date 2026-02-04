export interface ChannelCredentialField {
  key: string;
  label: string;
  placeholder: string;
  type: 'text' | 'password';
  required: boolean;
}

export interface ChannelDefinition {
  id: string;
  label: string;
  icon: string;
  popular: boolean;
  tokenHint: string;
  tokenPlaceholder: string;
  /** Credential fields required for this channel */
  credentials: ChannelCredentialField[];
  /** Help link for obtaining credentials */
  helpUrl?: string;
  /** Help link text */
  helpText?: string;
}
