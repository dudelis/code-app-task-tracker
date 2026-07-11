"""List non-Microsoft publishers in the target environment so a publisher can be chosen."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from auth import get_credential, load_env

from PowerPlatform.Dataverse.client import DataverseClient


def main():
    load_env()
    client = DataverseClient(os.environ["DATAVERSE_URL"], get_credential())

    pages = client.records.get(
        "publisher",
        filter="customizationprefix ne 'none' and uniquename ne 'MicrosoftCorporation' and uniquename ne 'Microsoftdynamic'",
        select=["publisherid", "uniquename", "friendlyname", "customizationprefix"],
        top=50,
    )
    publishers = [p for page in pages for p in page]

    if not publishers:
        print("No custom publishers found.", flush=True)
        return

    print("Existing publishers:", flush=True)
    for p in publishers:
        print(
            f"  friendly='{p.get('friendlyname')}' unique='{p.get('uniquename')}' prefix='{p.get('customizationprefix')}_'",
            flush=True,
        )


if __name__ == "__main__":
    main()
