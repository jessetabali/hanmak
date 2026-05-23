from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from accounts.management.commands.seed_demo import seed_system_roles
from accounts.models import Membership, Organization, Team, UserProfile


class Command(BaseCommand):
    help = 'Create or update one app-level super admin for local/demo environments.'

    def add_arguments(self, parser):
        parser.add_argument('--username', default='superadmin')
        parser.add_argument('--email', default='superadmin@example.com')
        parser.add_argument('--password', default='superadmin123')
        parser.add_argument('--organization-slug', default='hanmak-root')
        parser.add_argument('--organization-name', default='HanMak Root')

    def handle(self, *args, **options):
        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=options['username'],
            defaults={
                'email': options['email'],
                'is_staff': True,
                'is_superuser': True,
            },
        )
        user.email = options['email']
        user.is_staff = True
        user.is_superuser = True
        user.set_password(options['password'])
        user.save(update_fields=['email', 'is_staff', 'is_superuser', 'password'])

        organization, _ = Organization.objects.get_or_create(
            slug=options['organization_slug'],
            defaults={
                'name': options['organization_name'],
                'legal_name': options['organization_name'],
                'primary_contact_email': options['email'],
            },
        )
        team, _ = Team.objects.get_or_create(
            organization=organization,
            name='Platform Administration',
            defaults={'description': 'Application-level administration team'},
        )
        Membership.objects.update_or_create(
            user=user,
            organization=organization,
            defaults={'team': team, 'role': Membership.Role.SUPER_ADMIN, 'is_active': True},
        )
        UserProfile.objects.get_or_create(
            user=user,
            defaults={'display_name': 'Super Admin', 'title': 'Application Administrator'},
        )
        seed_system_roles(organization)

        verb = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} super admin {options["username"]} for {organization.name}.'
        ))
