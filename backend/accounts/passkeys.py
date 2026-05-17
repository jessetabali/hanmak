from fido2.server import Fido2Server
from fido2.utils import websafe_decode, websafe_encode
from fido2.webauthn import (
    AttestedCredentialData,
    AuthenticationResponse,
    PublicKeyCredentialDescriptor,
    PublicKeyCredentialRpEntity,
    PublicKeyCredentialType,
    PublicKeyCredentialUserEntity,
    RegistrationResponse,
)


def passkey_server(rp_id='localhost', rp_name='HanMak'):
    return Fido2Server(PublicKeyCredentialRpEntity(name=rp_name, id=rp_id))


def passkey_user_entity(user):
    return PublicKeyCredentialUserEntity(
        id=str(user.id).encode(),
        name=user.get_username(),
        display_name=user.get_full_name() or user.get_username(),
    )


def serialize_passkey_state(state):
    serialized = dict(state)
    challenge = serialized.get('challenge')
    if isinstance(challenge, bytes):
        serialized['challenge'] = websafe_encode(challenge)
    return serialized


def deserialize_passkey_state(state):
    deserialized = dict(state)
    challenge = deserialized.get('challenge')
    if isinstance(challenge, str):
        deserialized['challenge'] = websafe_decode(challenge)
    return deserialized


def credential_creation_options_to_json(options):
    public_key = options.public_key
    return {
        'publicKey': {
            'rp': dict(public_key.rp),
            'user': {
                'id': websafe_encode(public_key.user.id),
                'name': public_key.user.name,
                'displayName': public_key.user.display_name,
            },
            'challenge': websafe_encode(public_key.challenge),
            'pubKeyCredParams': [
                {'type': param.type.value, 'alg': param.alg}
                for param in public_key.pub_key_cred_params
            ],
            'timeout': public_key.timeout,
            'attestation': public_key.attestation.value if public_key.attestation else 'none',
        }
    }


def credential_request_options_to_json(options):
    public_key = options.public_key
    return {
        'publicKey': {
            'challenge': websafe_encode(public_key.challenge),
            'timeout': public_key.timeout,
            'rpId': public_key.rp_id,
            'allowCredentials': [
                {'type': descriptor.type.value, 'id': websafe_encode(descriptor.id)}
                for descriptor in (public_key.allow_credentials or [])
            ],
            'userVerification': public_key.user_verification.value if public_key.user_verification else 'preferred',
        }
    }


def stored_credential_descriptors(devices):
    descriptors = []
    for device in devices:
        if device.credential_id:
            descriptors.append(
                PublicKeyCredentialDescriptor(
                    type=PublicKeyCredentialType.PUBLIC_KEY,
                    id=bytes.fromhex(device.credential_id),
                )
            )
    return descriptors


def stored_attested_credentials(devices):
    return [
        AttestedCredentialData(bytes.fromhex(device.public_key))
        for device in devices
        if device.public_key
    ]


def parse_registration_response(data):
    return RegistrationResponse.from_dict(data)


def parse_authentication_response(data):
    return AuthenticationResponse.from_dict(data)
