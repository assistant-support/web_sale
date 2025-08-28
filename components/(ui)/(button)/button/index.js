import React from 'react';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import { styled } from '@mui/material/styles';

// Simplified, performance-friendly (plain JS)
// - borderRadius: 5px
// - No box-shadow (any state)
// - No hover effects
// - Keep MUI features: variants, tooltip, loading, disabled, start/endIcon, forwardRef
// - Unified color control via `tone` (bg/border) and `onTone` (text + icons)
//   Legacy aliases supported: `colorHex` -> tone, `contentColorHex` -> onTone

const StyledButton = styled(Button, {
  shouldForwardProp: (prop) =>
    ![
      'tone',
      'onTone',
      'loading',
      'tooltip',
      // legacy accepted but not forwarded
      'rounded',
      'gradient',
      'glow',
      'colorHex',
      'contentColorHex',
    ].includes(prop),
})(({ theme, tone, onTone, variant = 'contained' }) => {
  const base = tone || theme.palette.primary.main;
  const content =
    onTone || (variant === 'contained' ? theme.palette.getContrastText(base) : base);

  const common = {
    textTransform: 'none',
    borderRadius: 5,
    padding: theme.spacing(.6, 2),
    fontWeight: 600,
    letterSpacing: 0.2,
    // No transitions to keep it snappy
    transition: 'none',

    // Ensure icons/spinner inherit text color
    '& .MuiButton-startIcon, & .MuiButton-endIcon, & .MuiSvgIcon-root': { color: 'inherit' },
    '& .MuiCircularProgress-root': { color: 'inherit' },

    '&.Mui-disabled': {
      opacity: 0.6,
    },
  };

  if (variant === 'contained') {
    return {
      ...common,
      color: content,
      backgroundColor: base,
      border: '1px solid transparent',
      boxShadow: 'none',
      '&:hover': {
        backgroundColor: base,
        boxShadow: 'none',
      },
      '&:active': {
        backgroundColor: base,
        boxShadow: 'none',
      },
      '&:focus': {
        boxShadow: 'none',
      },
    };
  }

  if (variant === 'outlined') {
    return {
      ...common,
      color: content, // defaults to base if onTone not provided
      backgroundColor: 'transparent',
      border: `1px solid ${base}`,
      boxShadow: 'none',
      '&:hover': {
        borderColor: base,
        backgroundColor: 'transparent',
        boxShadow: 'none',
      },
      '&:active': {
        borderColor: base,
        backgroundColor: 'transparent',
        boxShadow: 'none',
      },
      '&:focus': {
        boxShadow: 'none',
      },
    };
  }

  // text variant
  return {
    ...common,
    color: content, // defaults to base if onTone not provided
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    boxShadow: 'none',
    '&:hover': {
      backgroundColor: 'transparent',
      boxShadow: 'none',
    },
    '&:active': {
      backgroundColor: 'transparent',
      boxShadow: 'none',
    },
    '&:focus': {
      boxShadow: 'none',
    },
  };
});

export const BeautifulButton = React.forwardRef(function BeautifulButton(
  {
    tooltip,
    loading = false,
    disabled,
    children,
    endIcon,
    startIcon,
    tone,
    onTone,
    colorHex,
    contentColorHex,
    ...rest
  },
  ref
) {
  const resolvedTone = tone ?? colorHex;
  const resolvedOnTone = onTone ?? contentColorHex;

  const inner = (
    <StyledButton
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading ? 'true' : undefined}
      tone={resolvedTone}
      onTone={resolvedOnTone}
      startIcon={startIcon}
      endIcon={
        loading ? (
          <CircularProgress size={18} thickness={5} color="inherit" />
        ) : (
          endIcon
        )
      }
      {...rest}
    >
      {children}
    </StyledButton>
  );

  return tooltip ? <Tooltip title={tooltip}>{inner}</Tooltip> : inner;
});
