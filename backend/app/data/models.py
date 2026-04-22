from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()

class ProjectItem(Base):
    __tablename__ = "project_items"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey('projects.id'))
    item_type = Column(String)
    material_id =  Column(String)
    quantity = Column(Integer)
    selected_path = Column(String) # budget/green/fast BUT do we need to store that?
    production_plant = Column(String)
    cost = Column(Float)
    delivery_days = Column(Integer)
    est_co2 = Column(Float) #total co2 for this item
    grid_co2 = Column(Float) # grid intensity (kgCO2/kWh)

    project = relationship("Project", back_populates="items")



class Project(Base):
    __tablename__ = 'projects'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    created_at = Column(String) # or dateTime

    items = relationship("ProjectItem", back_populates="project")
