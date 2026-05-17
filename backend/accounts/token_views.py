from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .auth import HanMakTokenObtainPairSerializer, HanMakTokenRefreshSerializer


class HanMakTokenObtainPairView(TokenObtainPairView):
    serializer_class = HanMakTokenObtainPairSerializer


class HanMakTokenRefreshView(TokenRefreshView):
    serializer_class = HanMakTokenRefreshSerializer
