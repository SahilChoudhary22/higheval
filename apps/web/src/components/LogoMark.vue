<!--
  The HighEval mark: an "H" whose crossbar is a confidence interval with a point
  estimate and a dashed reference line. Drawn inline so it follows the theme
  tokens; decorative, because it always sits next to the "HighEval" wordmark.
-->
<template>
  <svg viewBox="120 120 272 272" width="1em" height="1em" aria-hidden="true">
    <path class="logo-mark__reference" d="M256 128V384" />
    <path
      class="logo-mark__ink"
      d="M137 128 L193 164 L193 215 L173 235 L173 277 L193 297 L193 348 L137 384 Z"
    />
    <path
      class="logo-mark__ink"
      d="M375 128 L319 164 L319 215 L339 235 L339 277 L319 297 L319 348 L375 384 Z"
    />
    <path class="logo-mark__interval" d="M174 256 H338 M174 241 V271 M338 241 V271" />
    <rect class="logo-mark__estimate" x="273" y="244" width="22" height="24" />
  </svg>
</template>

<style scoped>
.logo-mark__ink {
  fill: var(--color-ink);
}

.logo-mark__interval {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 10;
}

.logo-mark__estimate {
  fill: var(--color-accent);
}

.logo-mark__reference {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 3;
  stroke-dasharray: 10 13;
  opacity: 0.48;
}
</style>
