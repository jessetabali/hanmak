from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .auth import HanMakTokenObtainPairSerializer, HanMakTokenRefreshSerializer
from .throttles import LoginRateThrottle, TokenRefreshRateThrottle


class HanMakTokenObtainPairView(TokenObtainPairView):
    serializer_class = HanMakTokenObtainPairSerializer
    throttle_classes = [LoginRateThrottle]


class HanMakTokenRefreshView(TokenRefreshView):
    serializer_class = HanMakTokenRefreshSerializer
    throttle_classes = [TokenRefreshRateThrottle]
