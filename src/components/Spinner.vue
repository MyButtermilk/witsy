
<!-- https://codepen.io/jmak/pen/bGPzrQ -->

<template>
  <div class="spinner">
    <div class="spinner-blade"></div>
    <div class="spinner-blade"></div>
    <div class="spinner-blade"></div>
    <div class="spinner-blade"></div>
    <div class="spinner-blade"></div>
    <div class="spinner-blade"></div>
    <div class="spinner-blade"></div>
    <div class="spinner-blade"></div>
    <div class="spinner-blade"></div>
    <div class="spinner-blade"></div>
    <div class="spinner-blade"></div>
    <div class="spinner-blade"></div>
  </div>
</template>

<style scoped>

.spinner {
  font-size: 12px;
  position: relative;
  display: inline-block;
  width: 1em;
  height: 1em;

  &.large {
    transform: scale(1.5);
  }
}

.spinner-blade {
  position: absolute;
  left: 0.4629em;
  bottom: 0;
  width: 0.074em;
  height: 0.2777em;
  border-radius: 0.5em;
  background-color: transparent;
  transform-origin: center -0.2222em;
  -webkit-animation: spinner-fade 1s infinite linear;
          animation: spinner-fade 1s infinite linear;
}
.spinner-blade:nth-child(1) {
  -webkit-animation-delay: 0s;
          animation-delay: 0s;
  transform: rotate(0deg);
}
.spinner-blade:nth-child(2) {
  -webkit-animation-delay: 0.083s;
          animation-delay: 0.083s;
  transform: rotate(30deg);
}
.spinner-blade:nth-child(3) {
  -webkit-animation-delay: 0.166s;
          animation-delay: 0.166s;
  transform: rotate(60deg);
}
.spinner-blade:nth-child(4) {
  -webkit-animation-delay: 0.249s;
          animation-delay: 0.249s;
  transform: rotate(90deg);
}
.spinner-blade:nth-child(5) {
  -webkit-animation-delay: 0.332s;
          animation-delay: 0.332s;
  transform: rotate(120deg);
}
.spinner-blade:nth-child(6) {
  -webkit-animation-delay: 0.415s;
          animation-delay: 0.415s;
  transform: rotate(150deg);
}
.spinner-blade:nth-child(7) {
  -webkit-animation-delay: 0.498s;
          animation-delay: 0.498s;
  transform: rotate(180deg);
}
.spinner-blade:nth-child(8) {
  -webkit-animation-delay: 0.581s;
          animation-delay: 0.581s;
  transform: rotate(210deg);
}
.spinner-blade:nth-child(9) {
  -webkit-animation-delay: 0.664s;
          animation-delay: 0.664s;
  transform: rotate(240deg);
}
.spinner-blade:nth-child(10) {
  -webkit-animation-delay: 0.747s;
          animation-delay: 0.747s;
  transform: rotate(270deg);
}
.spinner-blade:nth-child(11) {
  -webkit-animation-delay: 0.83s;
          animation-delay: 0.83s;
  transform: rotate(300deg);
}
.spinner-blade:nth-child(12) {
  -webkit-animation-delay: 0.913s;
          animation-delay: 0.913s;
  transform: rotate(330deg);
}

@-webkit-keyframes spinner-fade {
  0% { background-color: var(--text-color); }
  100% { background-color: transparent; }
}

@keyframes spinner-fade {
  0% { background-color: var(--text-color); }
  100% { background-color: transparent; }
}

</style>
